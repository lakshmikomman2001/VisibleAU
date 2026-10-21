import type { LLMErrorClass } from "./errors";
import type { CompleteOutput } from "./interface";
import { classifyError, type ClassifiedError } from "./classify-error";

/** Truncated at write time (db/schema/engine-call-failures.ts's
 * error_message column has no length cap of its own). */
const ERROR_MESSAGE_MAX_LENGTH = 500;

/** Base jittered backoff before the first retry -- short, because
 * this runs inside an audit's own overall time budget (Part C's
 * deadline), not a background job with minutes to spare. 500-1000ms
 * before doubling on each subsequent retry (see jitteredBackoff). */
const RETRY_BASE_DELAY_MS = 500;
const RETRY_JITTER_MS = 500;
const RETRY_BACKOFF_MULTIPLIER = 2;

/**
 * Reliability follow-up, item 2: before Part A, the AI SDK's own
 * built-in retry covered rate_limited/overloaded/network errors with
 * up to 2 retries (3 attempts total) -- Part A's maxRetries: 0 (so
 * this file could be the ONE observable retry layer) silently dropped
 * that down to 1 retry for every class, which means strictly MORE
 * failed answers for exactly the two classes a transient-capacity
 * problem is most likely to be: a provider's own rate limit or
 * overload. Restored here, per class, as named constants rather than
 * a single shared number, because the right attempt count genuinely
 * differs by class: rate_limited/overloaded are classic "wait and it
 * clears" conditions worth real persistence on; timeout/
 * search_tool_error are already a full request's worth of latency
 * each, where a second whole retry has rapidly diminishing odds of
 * helping and a real cost (another full timeout window) if it
 * doesn't.
 */
const MAX_RETRIES_BY_CLASS: Partial<Record<LLMErrorClass, number>> = {
  rate_limited: 2, // 3 attempts total -- restores (at minimum) the pre-Part-A count
  overloaded: 2, // 3 attempts total -- restores (at minimum) the pre-Part-A count
  timeout: 1, // 2 attempts total -- unchanged from Part A
  search_tool_error: 1, // 2 attempts total -- unchanged from Part A (only for a retryable code)
};

function maxRetriesFor(errorClass: LLMErrorClass): number {
  return MAX_RETRIES_BY_CLASS[errorClass] ?? 0;
}

export interface CallSuccess {
  status: "success";
  output: CompleteOutput;
  /** 1 if it succeeded on the first try; up to 3 for rate_limited/
   * overloaded, which get 2 retries (see MAX_RETRIES_BY_CLASS). */
  attempts: number;
  latencyMs: number;
}

export interface CallFailure {
  status: "failure";
  errorClass: ClassifiedError["errorClass"];
  /** Truncated to ERROR_MESSAGE_MAX_LENGTH. */
  errorMessage: string;
  attempts: number;
  latencyMs: number;
  /** Real cost already billed (a SearchToolError's in-band failure) --
   * 0 for anything that threw before any response came back. */
  costUsd: number;
}

export type CallResult = CallSuccess | CallFailure;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `retryNumber` is 1 for the first retry, 2 for the second, so a
 * class with 2 retries backs off 500-1000ms then 1000-1500ms, not the
 * same window twice -- genuinely later attempts wait longer, since a
 * condition that didn't clear after one wait is less likely to clear
 * immediately after a second identical one. */
function jitteredBackoff(retryNumber: number): number {
  return RETRY_BASE_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** (retryNumber - 1) + Math.random() * RETRY_JITTER_MS;
}

/**
 * Audit reliability, Part A, item 3 / reliability follow-up item 2 --
 * the one shared retry wrapper for all 4 engines, used by both
 * runners instead of calling `llm.complete()` directly. Retry counts
 * are per error class (MAX_RETRIES_BY_CLASS above), never a single
 * shared number -- rate_limited/overloaded get up to 2 retries (3
 * attempts total, restoring at least the attempt count the AI SDK's
 * own now-disabled retry gave them before Part A); timeout/
 * search_tool_error get 1 (unchanged from Part A). Every attempt
 * beyond the first only runs if there's still time left in the
 * audit's own overall budget (`deadlineAt`, Part C), and honours the
 * provider's own Retry-After when the response carried one (waits AT
 * LEAST that long, never less, on top of this call's own jittered
 * backoff). Each *-impl.ts's own `maxRetries: 0` keeps the AI SDK's
 * built-in retry disabled for exactly the same reason as before: so
 * `attempts` here is the real, complete count, not an opaque mix of a
 * hidden SDK retry plus this one.
 *
 * Never throws -- a permanently-failed call resolves to a CallFailure
 * the caller inserts as an engine_call_failures row; it never has to
 * catch anything itself.
 */
export async function callWithRetry(
  fn: () => Promise<CompleteOutput>,
  opts: { deadlineAt?: number } = {},
): Promise<CallResult> {
  const startedAt = Date.now();
  // Audit reliability, Part A, item 4: a retried call can be billed on
  // every attempt (an in-band search-tool error still charges for the
  // model call itself, every time it happens) -- summed across every
  // attempt, never just the last one, so a billed-then-retried-then-
  // billed-again call can't silently lose an earlier attempt's cost.
  let totalCostUsd = 0;

  for (let attempt = 1; ; attempt++) {
    try {
      const output = await fn();
      return { status: "success", output, attempts: attempt, latencyMs: Date.now() - startedAt };
    } catch (err) {
      const classified = classifyError(err);
      totalCostUsd += classified.costUsd;

      const retriesSoFar = attempt - 1;
      const retryNumber = attempt; // the retry we're ABOUT to make, if any
      const underClassLimit = classified.retryable && retriesSoFar < maxRetriesFor(classified.errorClass);

      // The provider's own stated wait, when it sent one, floors the
      // delay -- this call's own jittered backoff can still push it
      // longer (e.g. a second retry's doubled base), but never shorter
      // than what the server actually asked for.
      const backoffMs = Math.max(jitteredBackoff(retryNumber), classified.retryAfterMs ?? 0);
      const hasTimeForRetry = opts.deadlineAt === undefined || Date.now() + backoffMs < opts.deadlineAt;

      if (underClassLimit && hasTimeForRetry) {
        await sleep(backoffMs);
        continue;
      }

      return {
        status: "failure",
        errorClass: classified.errorClass,
        errorMessage: classified.message.slice(0, ERROR_MESSAGE_MAX_LENGTH),
        attempts: attempt,
        latencyMs: Date.now() - startedAt,
        costUsd: totalCostUsd,
      };
    }
  }
}
