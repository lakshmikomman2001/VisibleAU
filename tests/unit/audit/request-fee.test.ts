/**
 * Price corrections (25 Oct), item 2 -- the per-request fee path, ready for
 * Perplexity's fee once diag-0101-perplexity-cost-by-day.sql has been checked
 * against the bill. Counted once per billed request, billed retries
 * included; null (not known yet) adds nothing and is never "Cost incomplete".
 */
import { describe, expect, it, vi } from "vitest";
import { computeCostUsd, type ModelPrice, modelPrice, priceCall } from "@/lib/audit/compute-cost";
import { SearchToolError } from "@/lib/llm/errors";
import type { CompleteOutput } from "@/lib/llm/interface";
import { callWithRetry } from "@/lib/llm/with-retry";

/** A fixture price with a fee set: $1 / $1 per 1M tokens, $0.005 per request. */
const WITH_FEE: ModelPrice = {
  engine: "perplexity",
  input: 0.001,
  output: 0.001,
  requestFeeUsd: 0.005,
};
const TOKENS_ONLY = (1000 / 1000) * 0.001 + (500 / 1000) * 0.001; // 1,000 in + 500 out

describe("request fee", () => {
  it("one call costs tokens + fee", () => {
    expect(priceCall(WITH_FEE, 1000, 500)).toBeCloseTo(TOKENS_ONLY + 0.005, 9);
  });

  it("a billed retry adds the fee twice", async () => {
    const perAttempt = priceCall(WITH_FEE, 1000, 500);
    const answer: CompleteOutput = {
      response: "an answer",
      model: "sonar",
      tokensUsed: 1500,
      costEstimateUsd: perAttempt,
      isCacheHit: false,
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new SearchToolError("tool failed", "too_many_requests", perAttempt))
      .mockResolvedValueOnce(answer);

    const result = await callWithRetry(fn);

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.attempts).toBe(2);
    expect(result.output.costEstimateUsd).toBeCloseTo(2 * (TOKENS_ONLY + 0.005), 9);
  });

  it("a null fee adds nothing", () => {
    expect(priceCall({ ...WITH_FEE, requestFeeUsd: null }, 1000, 500)).toBeCloseTo(TOKENS_ONLY, 9);
  });

  it("Perplexity's fee is null -- not yet added, and not a 0 that would hide the TODO", () => {
    for (const model of ["sonar", "sonar-pro"]) {
      expect(modelPrice(model)?.requestFeeUsd, model).toBeNull();
    }
  });

  it("a null fee is never 'Cost incomplete': the call still has a known cost", () => {
    const cost = computeCostUsd("sonar", 1000, 500);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(TOKENS_ONLY, 9);
  });

  it("the other engines' models carry an explicit 0 fee (their search fees are separate)", () => {
    for (const model of [
      "gpt-4.1",
      "gpt-4.1-mini",
      "claude-haiku-4-5",
      "claude-sonnet-4-6",
      "gemini-2.5-flash",
    ]) {
      expect(modelPrice(model)?.requestFeeUsd, model).toBe(0);
    }
  });
});
