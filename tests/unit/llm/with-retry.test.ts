import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompleteOutput } from "@/lib/llm/interface";
import { callWithRetry } from "@/lib/llm/with-retry";

function output(overrides: Partial<CompleteOutput> = {}): CompleteOutput {
  return {
    response: "A real answer.",
    model: "test-model",
    tokensUsed: 100,
    costEstimateUsd: 0.001,
    isCacheHit: false,
    ...overrides,
  };
}

function rateLimited(message = "Too Many Requests") {
  return Object.assign(new Error(message), { statusCode: 429 });
}

function overloaded(message = "Service Unavailable") {
  return Object.assign(new Error(message), { statusCode: 503 });
}

describe("callWithRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a call that succeeds on the first try: attempts = 1, never sleeps", async () => {
    const fn = vi.fn().mockResolvedValue(output());
    const result = await callWithRetry(fn);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.attempts).toBe(1);
      expect(result.output.response).toBe("A real answer.");
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a retryable failure (429) that succeeds on the first retry: attempts = 2, counted as a normal answer", async () => {
    const fn = vi.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValueOnce(output());
    const result = await callWithRetry(fn);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.attempts).toBe(2);
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // Reliability follow-up, item 2: rate_limited/overloaded get up to 2
  // retries now (3 attempts total), restoring at least the attempt
  // count the AI SDK's own built-in retry gave them before Part A's
  // maxRetries: 0 silently dropped every class to 1 retry.
  it("a 429 is retried twice, then recorded as a failure: exactly 3 attempts", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimited());
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.errorClass).toBe("rate_limited");
      expect(result.attempts).toBe(3);
    }
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("a persistent 503 (overloaded) is also retried twice -- 3 attempts, then a recorded failure", async () => {
    const fn = vi.fn().mockRejectedValue(overloaded());
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.errorClass).toBe("overloaded");
      expect(result.attempts).toBe(3);
    }
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("a persistent timeout gets exactly ONE retry (2 attempts) -- unchanged from Part A", async () => {
    const timeoutErr = new Error("The operation timed out");
    timeoutErr.name = "TimeoutError";
    const fn = vi.fn().mockRejectedValue(timeoutErr);
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.errorClass).toBe("timeout");
      expect(result.attempts).toBe(2);
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a non-retryable failure (other) never retries: attempts = 1", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Something completely unexpected"));
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.errorClass).toBe("other");
      expect(result.attempts).toBe(1);
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never retries once the deadline is effectively now, even for a retryable class", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimited());
    const result = await callWithRetry(fn, { deadlineAt: Date.now() }); // no time left
    expect(result.status).toBe("failure");
    expect(fn).toHaveBeenCalledTimes(1); // the retry was skipped, not attempted and then cut off
  });

  it("still retries when the deadline is comfortably in the future", async () => {
    const fn = vi.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValueOnce(output());
    const result = await callWithRetry(fn, { deadlineAt: Date.now() + 60_000 });
    expect(result.status).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // Reliability follow-up, item 2: "always stop at deadlineAt" applies
  // just as much to the SECOND retry of a class that now gets two --
  // a deadline that has room for the first retry's backoff but not a
  // second must still cut it short at 2 attempts, not 3.
  it("the deadline cuts a multi-retry sequence short -- room for one retry's backoff, not a second's", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimited());
    // First backoff is 500-1000ms; second (doubled base) is
    // 1000-1500ms. A deadline ~1200ms out comfortably covers the
    // first wait but can never cover the second.
    const result = await callWithRetry(fn, { deadlineAt: Date.now() + 1200 });
    expect(result.status).toBe("failure");
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("truncates a long error message to 500 characters", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("x".repeat(2000)));
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.errorMessage.length).toBe(500);
    }
  });

  it("a SearchToolError's real billed cost survives into the failure record", async () => {
    const { SearchToolError } = await import("@/lib/llm/errors");
    const fn = vi.fn().mockRejectedValue(new SearchToolError("tool failed", "unrecognised_code", 0.0077));
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.errorClass).toBe("search_tool_error");
      expect(result.costUsd).toBe(0.0077); // billed before the failure was noticed
      expect(result.attempts).toBe(1); // unrecognised code -> not retried
    }
  });

  it("a call billed on BOTH attempts (retryable search_tool_error twice) sums the cost, never drops the first attempt's", async () => {
    const { SearchToolError } = await import("@/lib/llm/errors");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new SearchToolError("tool failed #1", "max_uses_exceeded", 0.004))
      .mockRejectedValueOnce(new SearchToolError("tool failed #2", "max_uses_exceeded", 0.005));
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.attempts).toBe(2);
      expect(result.costUsd).toBeCloseTo(0.009, 6); // 0.004 + 0.005, not just the last one
    }
  });

  // Reliability follow-up, item 2: rate_limited/overloaded can now run
  // to 3 attempts -- a plain rejection of either class always costs 0
  // (only a SearchToolError, capped at 1 retry, ever carries real
  // cost -- it represents a response that DID come back and get
  // billed, unlike a rate-limit/overload rejection), so the honest
  // proof here is that summing three real $0 contributions still
  // lands on exactly 0, never NaN or some other arithmetic drift,
  // across the longer attempt sequence.
  it("cost sums correctly (to exactly 0) across all 3 attempts of a persistent 429 -- never NaN", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimited());
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.attempts).toBe(3);
      expect(result.costUsd).toBe(0);
      expect(Number.isNaN(result.costUsd)).toBe(false);
    }
  });

  it("latencyMs is always a real, positive number", async () => {
    const fn = vi.fn().mockResolvedValue(output());
    const result = await callWithRetry(fn);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  // Reliability follow-up, item 2: "honouring a retry-after header if
  // present" -- fake timers prove the ACTUAL wait is at least the
  // server's stated value, not just the shorter default jittered
  // backoff that would otherwise apply.
  describe("retry-after is honoured", () => {
    it("waits at least the server's Retry-After before the next attempt (AI SDK shape: responseHeaders)", async () => {
      vi.useFakeTimers();
      const err = Object.assign(new Error("Too Many Requests"), {
        statusCode: 429,
        responseHeaders: { "retry-after": "5" }, // 5 real seconds
      });
      const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(output());

      const resultPromise = callWithRetry(fn);

      // The default jittered backoff alone would be done by 1000ms;
      // Retry-After=5s means the retry must NOT have fired yet.
      await vi.advanceTimersByTimeAsync(1000);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(4500); // now past 5s total
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await resultPromise;
      expect(result.status).toBe("success");
    });

    it("waits at least the server's Retry-After (Perplexity shape: retryAfterHeader attached to a plain Error)", async () => {
      vi.useFakeTimers();
      const err = Object.assign(new Error("Perplexity API 429: rate limited"), {
        statusCode: 429,
        retryAfterHeader: "3",
      });
      const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(output());

      const resultPromise = callWithRetry(fn);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2500);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await resultPromise;
      expect(result.status).toBe("success");
    });

    it("a deadline shorter than Retry-After still cuts the retry short -- 'always stop at deadlineAt'", async () => {
      const err = Object.assign(new Error("Too Many Requests"), {
        statusCode: 429,
        responseHeaders: { "retry-after": "30" }, // far longer than any real deadline
      });
      const fn = vi.fn().mockRejectedValue(err);
      const result = await callWithRetry(fn, { deadlineAt: Date.now() + 200 });
      expect(result.status).toBe("failure");
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // "Audits time out on Vercel" follow-up, item 2 -- the real
  // INNGEST_STEP_BUDGET_MS a call:<engine>:<promptIndex> step in
  // inngest/functions/run-audit.ts actually passes as its deadline,
  // not a generic test-only value. Proves the mechanism already
  // covered above by this file's other deadline tests genuinely
  // bounds a step to this specific, real budget: even a pathological
  // Retry-After far longer than the whole budget never makes the
  // call wait past it, and no real wall-clock time is ever spent
  // waiting out the fake clock.
  describe("bounded by the real INNGEST_STEP_BUDGET_MS a run-audit.ts step actually uses", () => {
    it("a Retry-After far longer than the step budget still returns a failure (with its real cost) well inside the budget, never exceeding it", async () => {
      const { INNGEST_STEP_BUDGET_MS } = await import("@/lib/llm/step-budget");
      const { SearchToolError } = await import("@/lib/llm/errors");
      vi.useFakeTimers();
      const start = Date.now();
      const deadlineAt = start + INNGEST_STEP_BUDGET_MS;

      // A provider asking to wait 10 minutes -- wildly longer than
      // even the 290s step budget itself, let alone what's left of
      // it after one real per-call timeout.
      const err = Object.assign(new SearchToolError("rate limited", "429", 0.001), {
        statusCode: 429,
        responseHeaders: { "retry-after": "600" },
      });
      const fn = vi.fn().mockRejectedValue(err);

      const resultPromise = callWithRetry(fn, { deadlineAt });
      // Advance the fake clock all the way to (and past) the step
      // budget itself -- if the retry loop were still waiting out
      // the 600s Retry-After, the promise would still be pending
      // here and this await would hang the test until its own
      // timeout, not resolve.
      await vi.advanceTimersByTimeAsync(INNGEST_STEP_BUDGET_MS + 5_000);

      const result = await resultPromise;
      expect(result.status).toBe("failure");
      if (result.status === "failure") {
        expect(result.errorClass).toBe("search_tool_error");
        expect(result.costUsd).toBe(0.001); // the real billed cost, not dropped
      }
      // Never a second attempt -- the retry that would have waited
      // out the Retry-After was skipped outright, not started and
      // then abandoned.
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // "Claude timeouts: per-engine call timeouts" (23 Oct) -- Claude's
  // own per-attempt timeout is 75s (lib/llm/web-search-config.ts's
  // ENGINE_CALL_TIMEOUT_MS.claude), 2.5x the other three engines'. The
  // task's own worst-case arithmetic: one 75s timeout plus its one
  // allowed retry (with-retry.ts's MAX_RETRIES_BY_CLASS.timeout = 1)
  // is ~150s plus backoff -- comfortably inside the 290s
  // INNGEST_STEP_BUDGET_MS one call:<engine>:<promptIndex> step gets.
  // This proves it against the REAL constants, not just restated
  // arithmetic in a comment.
  describe("Claude's 75s timeout + its one retry still fits the real step budget", () => {
    it("ENGINE_CALL_TIMEOUT_MS.claude is 75s; the other three engines are unchanged at 30s", async () => {
      const { ENGINE_CALL_TIMEOUT_MS } = await import("@/lib/llm/web-search-config");
      expect(ENGINE_CALL_TIMEOUT_MS.claude).toBe(75_000);
      expect(ENGINE_CALL_TIMEOUT_MS.chatgpt).toBe(30_000);
      expect(ENGINE_CALL_TIMEOUT_MS.gemini).toBe(30_000);
      expect(ENGINE_CALL_TIMEOUT_MS.perplexity).toBe(30_000);
    });

    it("a call that takes exactly 75s to time out, twice, still finishes well inside the 290s step budget", async () => {
      const { ENGINE_CALL_TIMEOUT_MS } = await import("@/lib/llm/web-search-config");
      const { INNGEST_STEP_BUDGET_MS } = await import("@/lib/llm/step-budget");
      vi.useFakeTimers();

      // Simulates anthropic-impl.ts's own AbortSignal.timeout(75_000)
      // actually firing -- the mock fn only rejects once 75s of fake
      // time has really elapsed, exactly like a real abort would.
      const fn = vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => {
              const err = new Error("The operation was aborted.");
              err.name = "AbortError";
              reject(err);
            }, ENGINE_CALL_TIMEOUT_MS.claude);
          }),
      );

      const start = Date.now();
      const deadlineAt = start + INNGEST_STEP_BUDGET_MS;
      const resultPromise = callWithRetry(fn, { deadlineAt });

      // Drive the fake clock through: first 75s timeout, the jittered
      // backoff (<=1000ms), then the second 75s timeout -- call it
      // ~151s, with real margin against the 290s budget.
      await vi.advanceTimersByTimeAsync(ENGINE_CALL_TIMEOUT_MS.claude);
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(ENGINE_CALL_TIMEOUT_MS.claude);

      const result = await resultPromise;
      expect(result.status).toBe("failure");
      if (result.status === "failure") {
        expect(result.errorClass).toBe("timeout");
        expect(result.attempts).toBe(2); // exactly one retry, per MAX_RETRIES_BY_CLASS.timeout
        expect(result.latencyMs).toBeLessThan(INNGEST_STEP_BUDGET_MS);
        expect(result.latencyMs).toBeGreaterThanOrEqual(2 * ENGINE_CALL_TIMEOUT_MS.claude);
      }
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
