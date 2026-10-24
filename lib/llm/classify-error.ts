import {
  EmptyResponseError,
  isRetryableSearchToolErrorCode,
  type LLMErrorClass,
  RETRYABLE_ERROR_CLASSES,
  SearchToolError,
} from "./errors";

export interface ClassifiedError {
  errorClass: LLMErrorClass;
  retryable: boolean;
  /** Already billed before this error was raised (SearchToolError and
   * EmptyResponseError) -- 0 for anything that threw before any response
   * came back, null when the model has no price. */
  costUsd: number | null;
  /** Cap-only stand-in for a null costUsd; never displayed. */
  capReserveUsd: number;
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
}

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
  const fromHeaders = headers ? headers["retry-after"] ?? headers["Retry-After"] : undefined;
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
      toolErrorCode: err.toolErrorCode,
      message: err.message,
    };
  }

  if (err instanceof EmptyResponseError) {
    return {
      errorClass: "empty_response",
      retryable: false,
      costUsd: err.costUsd,
      capReserveUsd: err.capReserveUsd,
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
  if (status === 429) {
    return {
      errorClass: "rate_limited",
      retryable: true,
      costUsd: 0,
      capReserveUsd: 0,
      message: err instanceof Error ? err.message : String(err),
      retryAfterMs: retryAfterMsOf(err),
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
    };
  }

  return {
    errorClass: "other",
    retryable: false,
    costUsd: 0,
    capReserveUsd: 0,
    message: err instanceof Error ? err.message : String(err),
  };
}

export { RETRYABLE_ERROR_CLASSES };
