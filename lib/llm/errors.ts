/**
 * Audit reliability, Part A -- the one shared error-class vocabulary
 * for all 4 engines (lib/llm/classify-error.ts does the actual
 * classifying). Matches db/schema/engine-call-failures.ts's
 * error_class CHECK constraint exactly.
 */
export type LLMErrorClass =
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "search_tool_error"
  | "empty_response"
  | "parse_error"
  | "other";

/** Error classes worth retrying once -- rate_limited/overloaded/timeout
 * are always transient-by-nature; search_tool_error is transient only
 * for specific codes (see isRetryableSearchToolErrorCode below). */
export const RETRYABLE_ERROR_CLASSES: readonly LLMErrorClass[] = [
  "rate_limited",
  "overloaded",
  "timeout",
];

/** Codes a provider's in-band web-search tool error can carry that are
 * worth one retry -- a transient capacity/rate problem on the SEARCH
 * call itself, not a permanent one (e.g. a query the tool refuses
 * outright). Unknown codes are deliberately NOT retried -- retrying
 * blind on an unrecognised code risks looping on a permanent failure. */
const RETRYABLE_SEARCH_TOOL_ERROR_CODES = new Set([
  "too_many_requests",
  "rate_limit_exceeded",
  "max_uses_exceeded",
  "unavailable",
]);

export function isRetryableSearchToolErrorCode(code: string | undefined): boolean {
  return !!code && RETRYABLE_SEARCH_TOOL_ERROR_CODES.has(code);
}

/**
 * Thrown by an *-impl.ts when a provider's web-search tool came back
 * with an in-band error (lib/llm/web-search-config.ts's
 * hasFailedToolResult) -- carries the specific tool error code (when
 * the provider's response exposes one) and the REAL cost already
 * billed for this call (the model call itself completed and returned
 * usage before the tool failure was noticed), so a caller never has
 * to re-derive either from a generic Error.
 */
export class SearchToolError extends Error {
  readonly toolErrorCode: string | undefined;
  readonly costUsd: number;

  constructor(message: string, toolErrorCode: string | undefined, costUsd: number) {
    super(message);
    this.name = "SearchToolError";
    this.toolErrorCode = toolErrorCode;
    this.costUsd = costUsd;
  }
}

/** Thrown when a provider returns HTTP 200 with no usable text at all
 * (empty/whitespace-only response) -- distinct from a thrown network/
 * API error, and from a search-tool error (the model itself answered,
 * just with nothing). */
export class EmptyResponseError extends Error {
  constructor(engine: string) {
    super(`${engine} returned an empty response`);
    this.name = "EmptyResponseError";
  }
}
