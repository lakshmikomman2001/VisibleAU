import {
  EmptyResponseError,
  IncompleteAnswerError,
  isRetryableSearchToolErrorCode,
  type LLMErrorClass,
  RETRYABLE_ERROR_CLASSES,
  SearchToolError,
} from "./errors";
import { matchesFailurePattern } from "./failure-patterns";
import type { CostSource } from "./interface";

export interface ClassifiedError {
  errorClass: LLMErrorClass;
  retryable: boolean;
  /** Already billed before this error was raised (SearchToolError and
   * EmptyResponseError) -- 0 for anything that threw before any response
   * came back, null when the model has no price. */
  costUsd: number | null;
  /** Cap-only stand-in for a null costUsd; never displayed. */
  capReserveUsd: number;
  /** Where a billed costUsd came from; undefined when nothing was billed. */
  costSource?: CostSource;
  /** The provider's own tool error code, when there was one. */
  toolErrorCode?: string;
  message: string;
  /** Reliability follow-up, item 2: the provider's own Retry-After,
   * in ms, when the response carried one -- lib/llm/with-retry.ts
   * waits AT LEAST this long before its next attempt instead of
   * guessing with jittered backoff alone. Only ever populated for
   * rate_limited/overloaded (the two classes a server would plausibly
   * send this header for); undefined otherwise. */
  retryAfterMs?: number;
  /** URGENT audit #37 (31 Oct), item 2: the HTTP status, when the error
   * carried one -- lib/llm/with-retry.ts writes it at the start of the
   * stored message ("HTTP 400 invalid_request_error: ..."), because an AI
   * SDK error's own message is just the provider's sentence. */
  statusCode?: number;
  /** The provider's error type or code, e.g. "invalid_request_error" or
   * "insufficient_quota" -- a bare identifier, never free text. */
  providerErrorType?: string;
  /** Engine-failure follow-ups (1 Nov), item 1: a more specific code when
   * the body carried one -- Anthropic's error.details.error_code
   * ("enforced_spend_limit_reached"), OpenAI's error.code
   * ("organization_spend_limit_exceeded"). A bare identifier. */
  providerErrorCode?: string;
  /** Engine-failure follow-ups (1 Nov), item 2: how many retries this
   * error gets when its class's own count (lib/llm/with-retry.ts's
   * MAX_RETRIES_BY_CLASS) isn't the right one -- a provider server error
   * is class "other" but gets one retry. */
  maxRetries?: number;
}

/** HTTP 500, 502 and 504 (a provider's api_error, bad gateway, gateway
 * timeout): usually a one-off on the provider's side, so worth one retry. */
const SERVER_ERROR_STATUSES = new Set([500, 502, 504]);
const SERVER_ERROR_RETRIES = 1;

/** The AI SDK's provider errors (@ai-sdk/provider's APICallError and
 * its per-provider subclasses) expose statusCode -- read it
 * structurally (a type guard, not an `instanceof` on a type this
 * package doesn't export a stable class for) rather than cast to any. */
function statusCodeOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = (err as { statusCode: unknown }).statusCode;
    if (typeof code === "number") return code;
  }
  // perplexity-impl.ts's own hand-rolled fetch throws a bare Error with
  // the status embedded in its message ("Perplexity API 429: ...") --
  // no statusCode property exists on a plain Error, so fall back to
  // the message text for that one engine.
  if (err instanceof Error) {
    const match = err.message.match(/\b(\d{3})\b/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

/**
 * The provider's own error type from an AI SDK APICallError's parsed body
 * (`data`): Anthropic's error.type ("invalid_request_error"), OpenAI's
 * error.type/code ("insufficient_quota"), Google's error.status
 * ("PERMISSION_DENIED"). Only a short identifier is ever kept.
 */
function providerErrorBody(err: unknown): Record<string, unknown> | undefined {
  if (typeof err !== "object" || err === null || !("data" in err)) return undefined;
  const data = (err as { data: unknown }).data;
  if (typeof data !== "object" || data === null) return undefined;
  const inner = (data as { error?: unknown }).error;
  return (typeof inner === "object" && inner !== null ? inner : data) as Record<string, unknown>;
}

/** A short identifier, never free text. */
function asIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z_]{3,40}$/.test(value) && value !== "error"
    ? value
    : undefined;
}

function providerErrorTypeOf(err: unknown): string | undefined {
  const source = providerErrorBody(err);
  if (!source) return undefined;
  for (const field of ["type", "code", "status"]) {
    const value = asIdentifier(source[field]);
    if (value) return value;
  }
  return undefined;
}

/** Anthropic's error.details.error_code, else OpenAI's error.code -- when it adds to the type. */
function providerErrorCodeOf(err: unknown, type: string | undefined): string | undefined {
  const source = providerErrorBody(err);
  if (!source) return undefined;
  const details = source.details;
  const fromDetails =
    typeof details === "object" && details !== null
      ? asIdentifier((details as Record<string, unknown>).error_code)
      : undefined;
  const code = fromDetails ?? asIdentifier(source.code);
  return code !== type ? code : undefined;
}

/**
 * A 429 that means the account is out of credit or over its quota, not a
 * rate limit: never retried, like a spend limit -- no retry succeeds until
 * credit is added or the quota resets (Sri's decision, 1 Nov). OpenAI
 * sends both as 429: out of quota with error.type "insufficient_quota"
 * (developers.openai.com/api/docs/guides/error-codes: "Retrying billing,
 * spend, or quota errors won't restore API access"), an ordinary rate
 * limit with error.code "rate_limit_exceeded". The provider's own type and
 * code decide; the message only when the error carried neither (a body
 * the AI SDK couldn't parse, Perplexity's plain Error) -- because a
 * message alone can't be trusted on a 429: Gemini's RESOURCE_EXHAUSTED,
 * documented as retry-with-backoff (ai.google.dev/gemini-api/docs/
 * troubleshooting), says "You exceeded your current quota, please check
 * your plan and billing details" for a per-minute rate limit too.
 */
function isOutOfQuota(
  providerErrorType: string | undefined,
  providerErrorCode: string | undefined,
  message: string,
): boolean {
  const identifiers = [providerErrorType, providerErrorCode].filter(Boolean).join(" ");
  return matchesFailurePattern("creditOrQuota", identifiers || message);
}

function isAbortOrTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  return /timed? ?out|aborted/i.test(err.message);
}

/**
 * Reliability follow-up, item 2 -- "honour a retry-after header if
 * present". Read structurally, same pattern as statusCodeOf: the AI
 * SDK's APICallError (openai/anthropic/google -- confirmed directly
 * against @ai-sdk/provider's own type) exposes the real response
 * headers as `responseHeaders`; perplexity-impl.ts's hand-rolled fetch
 * has no such structured error class, so it attaches the header value
 * itself onto the thrown Error as `retryAfterHeader` (see that file's
 * own comment). Either source is checked the same way here.
 */
function retryAfterMsOf(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  const headers = (err as { responseHeaders?: Record<string, string> }).responseHeaders;
  const fromHeaders = headers ? (headers["retry-after"] ?? headers["Retry-After"]) : undefined;
  const fromAttached = (err as { retryAfterHeader?: unknown }).retryAfterHeader;
  const raw = fromHeaders ?? (typeof fromAttached === "string" ? fromAttached : undefined);
  if (!raw) return undefined;

  // The RFC 7231 delta-seconds form -- by far the common case for a
  // rate-limit response.
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  // Retry-After can also be an HTTP-date; fall back to parsing it as
  // one rather than discarding a value that just isn't a plain number.
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

  return undefined;
}

/**
 * Audit reliability, Part A, item 2 -- the one shared classifier, used
 * by all 4 engines via lib/llm/with-retry.ts. Never throws; "other" is
 * the deliberate fallback for anything it can't identify, rather than
 * guessing a more specific (and possibly wrongly-retried) class.
 */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof SearchToolError) {
    const retryable = isRetryableSearchToolErrorCode(err.toolErrorCode);
    return {
      errorClass: "search_tool_error",
      retryable,
      costUsd: err.costUsd,
      capReserveUsd: err.capReserveUsd,
      costSource: err.costSource,
      toolErrorCode: err.toolErrorCode,
      message: err.message,
    };
  }

  // "Mention detection" (6 Nov), part 2: the provider stopped before the answer was complete -- billed,
  // never an answer, not retried.
  if (err instanceof IncompleteAnswerError) {
    return {
      errorClass: "incomplete_answer",
      retryable: false,
      costUsd: err.costUsd,
      capReserveUsd: err.capReserveUsd,
      costSource: err.costSource,
      message: err.message,
    };
  }

  if (err instanceof EmptyResponseError) {
    return {
      errorClass: "empty_response",
      retryable: false,
      costUsd: err.costUsd,
      capReserveUsd: err.capReserveUsd,
      costSource: err.costSource,
      message: err.message,
    };
  }

  if (err instanceof SyntaxError) {
    // JSON.parse (or res.json()) failing on a malformed body.
    return {
      errorClass: "parse_error",
      retryable: false,
      costUsd: 0,
      capReserveUsd: 0,
      message: err.message,
    };
  }

  if (isAbortOrTimeout(err)) {
    return {
      errorClass: "timeout",
      retryable: true,
      // "Claude timeouts: per-engine call timeouts" (23 Oct) -- diag-
      // 0090's production evidence recorded cost_usd = 0 for every
      // timeout failure, because an aborted request's AI SDK call
      // never returns a usage object to compute a real cost from. This
      // 0 means "unknown", NOT "free" -- the provider may still have
      // billed server-side work (a web search already performed, or
      // tokens already generated) before our own AbortSignal fired.
      // It still flows into the audit's recorded total the same way a
      // real cost would (inngest/functions/run-audit.ts's totalCost
      // sum, lib/audit/run-audit-inline.ts's matching one) -- just
      // correctly contributing exactly $0, the one honest value we
      // can state, rather than a guessed nonzero number.
      costUsd: 0,
      capReserveUsd: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const status = statusCodeOf(err);
  const providerErrorType = providerErrorTypeOf(err);
  const providerErrorCode = providerErrorCodeOf(err, providerErrorType);
  const statusFields = {
    ...(status !== undefined ? { statusCode: status } : {}),
    ...(providerErrorType ? { providerErrorType } : {}),
    ...(providerErrorCode ? { providerErrorCode } : {}),
  };
  const message = err instanceof Error ? err.message : String(err);
  // Engine-failure follow-ups (1 Nov), item 1: a spend limit is never
  // retried -- every retry is another refused call until the limit is
  // raised or resets. It can come as a 400 (Anthropic, a limit you set)
  // or a 429 with no retry-after (Anthropic's tier cap, OpenAI), so it's
  // checked before the 429 branch; "other", because it isn't a rate
  // limit that clears by waiting. lib/audit/engine-failure.ts names it
  // from the same patterns.
  if (
    matchesFailurePattern(
      "spendLimit",
      [message, providerErrorType, providerErrorCode].filter(Boolean).join(" "),
    )
  ) {
    return {
      errorClass: "other",
      retryable: false,
      costUsd: 0,
      capReserveUsd: 0,
      message,
      ...statusFields,
    };
  }
  // Methodology v2.2 (7 Nov), part 2: Google's daily limit on grounded Gemini requests
  // (lib/llm/failure-patterns.ts's dailySearchLimit) -- a rate limit, but one no retry gets past
  // before it resets at midnight Pacific time, so it isn't retried. Nothing was billed.
  if (status === 429 && matchesFailurePattern("dailySearchLimit", message)) {
    return {
      errorClass: "rate_limited",
      retryable: false,
      costUsd: 0,
      capReserveUsd: 0,
      message,
      ...statusFields,
    };
  }
  // Out of credit or quota (1 Nov, Sri's decision): not retried either.
  // Checked after the spend limit, which stays first (an OpenAI spend
  // limit is also type insufficient_quota, with a more specific code),
  // and before an ordinary 429, which is still retried.
  if (status === 429 && isOutOfQuota(providerErrorType, providerErrorCode, message)) {
    return {
      errorClass: "other",
      retryable: false,
      costUsd: 0,
      capReserveUsd: 0,
      message,
      ...statusFields,
    };
  }
  if (status === 429) {
    return {
      errorClass: "rate_limited",
      retryable: true,
      costUsd: 0,
      capReserveUsd: 0,
      message: err instanceof Error ? err.message : String(err),
      retryAfterMs: retryAfterMsOf(err),
      ...statusFields,
    };
  }
  // Engine-failure follow-ups (1 Nov), item 2 (Sri's decision): 500, 502
  // and 504 get ONE retry after the usual short jittered backoff. Still
  // class "other" -- error_class's CHECK has no server-error value, and
  // lib/audit/engine-failure.ts names it from the status in the stored
  // message. Other 4xx stay unretried.
  if (status !== undefined && SERVER_ERROR_STATUSES.has(status)) {
    return {
      errorClass: "other",
      retryable: true,
      maxRetries: SERVER_ERROR_RETRIES,
      costUsd: 0,
      capReserveUsd: 0,
      message,
      ...statusFields,
    };
  }
  if (status === 503 || status === 529) {
    return {
      errorClass: "overloaded",
      retryable: true,
      costUsd: 0,
      capReserveUsd: 0,
      message: err instanceof Error ? err.message : String(err),
      retryAfterMs: retryAfterMsOf(err),
      ...statusFields,
    };
  }

  return {
    errorClass: "other",
    retryable: false,
    costUsd: 0,
    capReserveUsd: 0,
    message: err instanceof Error ? err.message : String(err),
    ...statusFields,
  };
}

export { RETRYABLE_ERROR_CLASSES };
