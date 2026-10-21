import { describe, expect, it, vi } from "vitest";
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

describe("callWithRetry", () => {
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

  it("a retryable failure (429) that succeeds on retry: attempts = 2, counted as a normal answer", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Too Many Requests"), { statusCode: 429 }))
      .mockResolvedValueOnce(output());
    const result = await callWithRetry(fn);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.attempts).toBe(2);
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a retryable failure that fails again on retry: exactly ONE retry, then a recorded failure", async () => {
    const err = Object.assign(new Error("Service Unavailable"), { statusCode: 503 });
    const fn = vi.fn().mockRejectedValue(err);
    const result = await callWithRetry(fn);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.errorClass).toBe("overloaded");
      expect(result.attempts).toBe(2); // tried once, retried once, never a third time
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a non-retryable failure (empty_response) never retries: attempts = 1", async () => {
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
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("Too Many Requests"), { statusCode: 429 }));
    const result = await callWithRetry(fn, { deadlineAt: Date.now() }); // no time left
    expect(result.status).toBe("failure");
    expect(fn).toHaveBeenCalledTimes(1); // the retry was skipped, not attempted and then cut off
  });

  it("still retries when the deadline is comfortably in the future", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Too Many Requests"), { statusCode: 429 }))
      .mockResolvedValueOnce(output());
    const result = await callWithRetry(fn, { deadlineAt: Date.now() + 60_000 });
    expect(result.status).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

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

  it("latencyMs is always a real, positive number", async () => {
    const fn = vi.fn().mockResolvedValue(output());
    const result = await callWithRetry(fn);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
