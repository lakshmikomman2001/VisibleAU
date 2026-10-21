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
  /** Already billed before this error was raised (SearchToolError
   * only) -- 0 for anything that threw before any response came back. */
  costUsd: number;
  /** The provider's own tool error code, when there was one. */
  toolErrorCode?: string;
  message: string;
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
      toolErrorCode: err.toolErrorCode,
      message: err.message,
    };
  }

  if (err instanceof EmptyResponseError) {
    return { errorClass: "empty_response", retryable: false, costUsd: 0, message: err.message };
  }

  if (err instanceof SyntaxError) {
    // JSON.parse (or res.json()) failing on a malformed body.
    return { errorClass: "parse_error", retryable: false, costUsd: 0, message: err.message };
  }

  if (isAbortOrTimeout(err)) {
    return {
      errorClass: "timeout",
      retryable: true,
      costUsd: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const status = statusCodeOf(err);
  if (status === 429) {
    return {
      errorClass: "rate_limited",
      retryable: true,
      costUsd: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (status === 503 || status === 529) {
    return {
      errorClass: "overloaded",
      retryable: true,
      costUsd: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    errorClass: "other",
    retryable: false,
    costUsd: 0,
    message: err instanceof Error ? err.message : String(err),
  };
}

export { RETRYABLE_ERROR_CLASSES };
