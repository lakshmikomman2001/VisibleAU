import type { CompleteOutput } from "./interface";
import { classifyError, type ClassifiedError } from "./classify-error";

/** Truncated at write time (db/schema/engine-call-failures.ts's
 * error_message column has no length cap of its own). */
const ERROR_MESSAGE_MAX_LENGTH = 500;

/** Base jittered backoff before the one retry -- short, because this
 * runs inside an audit's own overall time budget (Part C's deadline),
 * not a background job with minutes to spare. 500-1000ms. */
const RETRY_BASE_DELAY_MS = 500;
const RETRY_JITTER_MS = 500;

export interface CallSuccess {
  status: "success";
  output: CompleteOutput;
  /** 1 if it succeeded on the first try, 2 if the retry succeeded. */
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

function jitteredBackoff(): number {
  return RETRY_BASE_DELAY_MS + Math.random() * RETRY_JITTER_MS;
}

/**
 * Audit reliability, Part A, item 3 -- the one shared retry wrapper
 * for all 4 engines, used by both runners instead of calling
 * `llm.complete()` directly. ONE retry, only for a classified-
 * retryable failure, only if there's still time left in the audit's
 * own overall budget (`deadlineAt`, Part C) -- never a second retry
 * (the AI SDK's own built-in retry is explicitly disabled by each
 * *-impl.ts's own `maxRetries: 0` for exactly this reason: so
 * `attempts` here is the real, complete count, not an opaque mix of a
 * hidden SDK retry plus this one).
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
  let lastClassified: ClassifiedError | null = null;
  // Audit reliability, Part A, item 4: a retried call can be billed on
  // BOTH attempts (an in-band search-tool error still charges for the
  // model call itself, every time it happens) -- summed across every
  // attempt, never just the last one, so a billed-then-retried-then-
  // billed-again call can't silently lose its first attempt's cost.
  let totalCostUsd = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const output = await fn();
      return { status: "success", output, attempts: attempt, latencyMs: Date.now() - startedAt };
    } catch (err) {
      const classified = classifyError(err);
      lastClassified = classified;
      totalCostUsd += classified.costUsd;

      const hasTimeForRetry =
        opts.deadlineAt === undefined || Date.now() + RETRY_BASE_DELAY_MS + RETRY_JITTER_MS < opts.deadlineAt;

      if (attempt === 1 && classified.retryable && hasTimeForRetry) {
        await sleep(jitteredBackoff());
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

  // Unreachable (the loop above always returns), but keeps the
  // compiler honest about CallResult always being produced.
  return {
    status: "failure",
    errorClass: lastClassified?.errorClass ?? "other",
    errorMessage: (lastClassified?.message ?? "unknown error").slice(0, ERROR_MESSAGE_MAX_LENGTH),
    attempts: 2,
    latencyMs: Date.now() - startedAt,
    costUsd: totalCostUsd,
  };
}
