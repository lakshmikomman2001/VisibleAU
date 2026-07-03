import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_SUB_QUERIES,
  MIN_SUB_QUERIES,
  SIMILARITY_THRESHOLD,
  simulateQueryFanOut,
} from "@/lib/visibility/fan-out-simulator";

describe("fan-out-simulator", () => {
  const mockGenerateSubQueries = async (_prompt: string, _model: string, count: number) =>
    Array.from({ length: count }, (_, i) => `Sub-query ${i + 1}`);

  const mockCheckBrandMention = async () => ({
    appeared: true,
    position: 1,
    responseText: "response",
  });

  it("generates between 3 and 12 sub-queries", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber sydney",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      generateSubQueries: mockGenerateSubQueries,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });

    expect(result.length).toBeGreaterThanOrEqual(MIN_SUB_QUERIES);
    expect(result.length).toBeLessThanOrEqual(DEFAULT_MAX_SUB_QUERIES);
  });

  it("sets above_threshold when similarity > 0.88", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: async (_, __, count) =>
        Array.from({ length: count }, (_, i) => `Query ${i}`),
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: (_a, _b) => 0.92,
    });

    expect(result.every((r) => r.aboveThreshold)).toBe(true);
    expect(SIMILARITY_THRESHOLD).toBe(0.88);
  });

  it("sets above_threshold=false when similarity <= 0.88", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: async (_, __, count) =>
        Array.from({ length: count }, (_, i) => `Query ${i}`),
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.85,
    });

    expect(result.every((r) => !r.aboveThreshold)).toBe(true);
  });

  it("respects budget cap via maxSubQueries", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 5,
      generateSubQueries: mockGenerateSubQueries,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("uses selectModel (no hardcoded model)", async () => {
    let capturedModel = "";
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: async (_prompt, model, count) => {
        capturedModel = model;
        return Array.from({ length: count }, (_, i) => `Q${i}`);
      },
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });

    expect(capturedModel).toBeTruthy();
    expect(capturedModel).not.toBe("");
    expect(result.length).toBeGreaterThan(0);
  });

  it("assigns sequential subQueryRank starting from 1", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: mockGenerateSubQueries,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });

    result.forEach((r, i) => {
      expect(r.subQueryRank).toBe(i + 1);
    });
  });

  it("rounds contentSimilarityScore to 3 decimal places", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: mockGenerateSubQueries,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.123456789,
    });

    for (const r of result) {
      expect(r.contentSimilarityScore).toBe(0.123);
      const decimalStr = String(r.contentSimilarityScore!).split(".")[1] ?? "";
      expect(decimalStr.length).toBeLessThanOrEqual(3);
    }
  });

  it("propagates brandAppeared=false and null position", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      maxSubQueries: 3,
      generateSubQueries: mockGenerateSubQueries,
      checkBrandMention: async () => ({
        appeared: false,
        position: null,
        responseText: "no mention",
      }),
      computeSimilarity: () => 0.7,
    });

    for (const r of result) {
      expect(r.brandAppeared).toBe(false);
      expect(r.brandPosition).toBeNull();
    }
  });

  it("no duplicate ranks across all results", async () => {
    const result = await simulateQueryFanOut({
      originalPrompt: "best plumber sydney",
      engine: "chatgpt",
      tier: "growth",
      brandName: "TestBrand",
      generateSubQueries: mockGenerateSubQueries,
      checkBrandMention: mockCheckBrandMention,
      computeSimilarity: () => 0.9,
    });

    const ranks = result.map((r) => r.subQueryRank);
    const uniqueRanks = new Set(ranks);
    expect(uniqueRanks.size).toBe(ranks.length);
  });
});
