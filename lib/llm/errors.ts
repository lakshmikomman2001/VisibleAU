import type { CostSource } from "./interface";

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
  // "Mention detection" (6 Nov), part 2: the provider stopped before the answer was complete.
  | "incomplete_answer"
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
  /** null when the model has no price (see CallCost in lib/audit/compute-cost.ts). */
  readonly costUsd: number | null;
  readonly capReserveUsd: number;
  readonly costSource: CostSource | undefined;

  constructor(
    message: string,
    toolErrorCode: string | undefined,
    costUsd: number | null,
    capReserveUsd = 0,
    costSource?: CostSource,
  ) {
    super(message);
    this.name = "SearchToolError";
    this.toolErrorCode = toolErrorCode;
    this.costUsd = costUsd;
    this.capReserveUsd = capReserveUsd;
    this.costSource = costSource;
  }
}

/** Thrown when a provider returns HTTP 200 with no usable text at all
 * (empty/whitespace-only response) -- distinct from a thrown network/
 * API error, and from a search-tool error (the model itself answered,
 * just with nothing). The call was still billed, so its cost travels
 * with it, like SearchToolError's. */
export class EmptyResponseError extends Error {
  readonly costUsd: number | null;
  readonly capReserveUsd: number;
  readonly costSource: CostSource | undefined;

  constructor(
    engine: string,
    costUsd: number | null = 0,
    capReserveUsd = 0,
    costSource?: CostSource,
  ) {
    super(`${engine} returned an empty response`);
    this.name = "EmptyResponseError";
    this.costUsd = costUsd;
    this.capReserveUsd = capReserveUsd;
    this.costSource = costSource;
  }
}

/**
 * "Mention detection" (6 Nov), part 2 -- the provider stopped before the answer was complete: Claude's turn
 * still paused (pause_turn) after MAX_PAUSE_TURN_CONTINUATIONS (lib/llm/stop-reason.ts), continuing it
 * failed, or a provider's own filter cut the answer off (Gemini RECITATION / SAFETY, OpenAI content_filter,
 * Claude refusal). Never stored or scored as an answer. Already billed, so the cost travels with it; not
 * retried (a paused turn has already been sent back up to 3 times).
 */
export class IncompleteAnswerError extends Error {
  readonly stopReason: string | undefined;
  /** null when the model has no price (see CallCost in lib/audit/compute-cost.ts). */
  readonly costUsd: number | null;
  readonly capReserveUsd: number;
  readonly costSource: CostSource | undefined;

  constructor(
    message: string,
    stopReason: string | undefined,
    costUsd: number | null,
    capReserveUsd = 0,
    costSource?: CostSource,
  ) {
    super(message);
    this.name = "IncompleteAnswerError";
    this.stopReason = stopReason;
    this.costUsd = costUsd;
    this.capReserveUsd = capReserveUsd;
    this.costSource = costSource;
  }
}
