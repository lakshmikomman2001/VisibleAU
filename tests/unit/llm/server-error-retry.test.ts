/**
 * Engine-failure follow-ups (1 Nov), item 2 (Sri's decision): a provider
 * server error -- HTTP 500, 502 or 504 -- gets ONE retry after a short
 * jittered backoff. Other 4xx are still not retried, and 503/529
 * (overloaded) keep their own 2 retries.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeEngineFailure } from "@/lib/audit/engine-failure";
import type { CompleteOutput } from "@/lib/llm/interface";
import { callWithRetry } from "@/lib/llm/with-retry";

function output(): CompleteOutput {
  return {
    response: "A real answer.",
    model: "test-model",
    tokensUsed: 100,
    costEstimateUsd: 0.001,
    isCacheHit: false,
  };
}

/** Shaped like the AI SDK's APICallError for Anthropic's 500. */
function serverError(statusCode: number) {
  return Object.assign(new Error("Internal server error"), {
    statusCode,
    data: { type: "error", error: { type: "api_error", message: "Internal server error" } },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a provider server error is retried once (1 Nov, item 2)", () => {
  it("a 500 then an answer: the answer is recorded, after 2 attempts", async () => {
    const fn = vi.fn().mockRejectedValueOnce(serverError(500)).mockResolvedValueOnce(output());
    const result = await callWithRetry(fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.attempts).toBe(2);
      expect(result.output.response).toBe("A real answer.");
    }
  });

  it("two 500s: one failure, attempts = 2, named a provider server error", async () => {
    const fn = vi.fn().mockRejectedValue(serverError(500));
    const result = await callWithRetry(fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.attempts).toBe(2);
      expect(result.errorClass).toBe("other");
      expect(result.errorMessage).toBe("HTTP 500 api_error: Internal server error");
      expect(
        describeEngineFailure({ errorClass: result.errorClass, message: result.errorMessage }).key,
      ).toBe("provider_server_error");
    }
  });

  it("502 and 504 too: one retry each", async () => {
    for (const status of [502, 504]) {
      const fn = vi.fn().mockRejectedValue(serverError(status));
      const result = await callWithRetry(fn);
      expect(fn, `HTTP ${status}`).toHaveBeenCalledTimes(2);
      expect(result.attempts, `HTTP ${status}`).toBe(2);
    }
  });

  it("Perplexity's own '500' message shape is retried once too", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Perplexity API 500: server error"))
      .mockResolvedValueOnce(output());
    const result = await callWithRetry(fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("success");
  });

  it("the retry waits a short jittered backoff: 500-1000 ms", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 500 + 0.5 x 500 = 750 ms
    const fn = vi.fn().mockRejectedValueOnce(serverError(500)).mockResolvedValueOnce(output());
    const pending = callWithRetry(fn);
    await vi.advanceTimersByTimeAsync(700);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect((await pending).status).toBe("success");
  });

  it("a 400 is still not retried", async () => {
    const fn = vi.fn().mockRejectedValue(
      Object.assign(new Error("prompt is too long"), {
        statusCode: 400,
        data: { error: { type: "invalid_request_error" } },
      }),
    );
    const result = await callWithRetry(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.attempts).toBe(1);
  });

  it("other 4xx (401, 403, 404, 413) are still not retried", async () => {
    for (const status of [401, 403, 404, 413]) {
      const fn = vi.fn().mockRejectedValue(Object.assign(new Error("no"), { statusCode: status }));
      const result = await callWithRetry(fn);
      expect(fn, `HTTP ${status}`).toHaveBeenCalledTimes(1);
      expect(result.attempts, `HTTP ${status}`).toBe(1);
    }
  });

  it("a 503 (overloaded) keeps its own 3 attempts", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("busy"), { statusCode: 503 }));
    const result = await callWithRetry(fn);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.status === "failure" && result.errorClass).toBe("overloaded");
  });

  it("the reason no longer says server errors aren't retried", () => {
    const r = describeEngineFailure({
      errorClass: "other",
      message: "HTTP 500 api_error: Internal server error",
    });
    expect(r.check).not.toContain("isn't retried");
    expect(r.check).toContain("even after one retry");
  });
});
