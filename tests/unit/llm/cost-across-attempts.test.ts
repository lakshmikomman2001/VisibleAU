/**
 * "Cost honesty" (25 Oct) -- no billed call is silently counted as $0: an attempt that was billed and
 * then failed stays in the eventual answer's cost, an unpriced attempt stays unknown (with its cap-only
 * reserve), and an empty-but-billed response keeps its cost.
 */
import { describe, expect, it, vi } from "vitest";
import { classifyError } from "@/lib/llm/classify-error";
import { EmptyResponseError, SearchToolError } from "@/lib/llm/errors";
import type { CompleteOutput } from "@/lib/llm/interface";
import { callWithRetry } from "@/lib/llm/with-retry";

function output(overrides: Partial<CompleteOutput> = {}): CompleteOutput {
  return {
    response: "an answer",
    model: "gpt-4.1-mini",
    tokensUsed: 100,
    costEstimateUsd: 0.002,
    isCacheHit: false,
    ...overrides,
  };
}

describe("callWithRetry keeps every billed attempt in the answer's cost", () => {
  it("a billed search-tool failure followed by a success costs both attempts, not just the last", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new SearchToolError("tool failed", "too_many_requests", 0.004))
      .mockResolvedValueOnce(output({ costEstimateUsd: 0.002 }));

    const result = await callWithRetry(fn);

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.attempts).toBe(2);
    expect(result.output.costEstimateUsd).toBeCloseTo(0.006, 6);
  });

  it("an unpriced earlier attempt makes the answer's cost unknown, carrying its cap-only reserve", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new SearchToolError("tool failed", "too_many_requests", null, 0.01))
      .mockResolvedValueOnce(output({ costEstimateUsd: 0.002 }));

    const result = await callWithRetry(fn);

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.output.costEstimateUsd).toBeNull();
    expect(result.output.capReserveUsd).toBeCloseTo(0.01, 6);
  });

  it("a first-try success is returned untouched", async () => {
    const answer = output();
    const result = await callWithRetry(vi.fn().mockResolvedValue(answer));
    expect(result.status === "success" && result.output).toBe(answer);
  });
});

describe("an empty-but-billed response keeps its cost", () => {
  it("classifyError reads it from the error", () => {
    const classified = classifyError(new EmptyResponseError("chatgpt", 0.003));
    expect(classified.errorClass).toBe("empty_response");
    expect(classified.costUsd).toBe(0.003);
  });

  it("callWithRetry records it on the failure", async () => {
    const result = await callWithRetry(
      vi.fn().mockRejectedValue(new EmptyResponseError("chatgpt", 0.003)),
    );
    expect(result.status).toBe("failure");
    if (result.status !== "failure") return;
    expect(result.costUsd).toBe(0.003);
  });
});
