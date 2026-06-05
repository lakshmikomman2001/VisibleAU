import { describe, expect, it } from "vitest";
import { evaluateTriggers } from "@/lib/recommendations/triggers";
import type { TriggerContext } from "@/lib/recommendations/types";

function makeCtx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    scoreFrequency: "80.00",
    scorePosition: "80.00",
    scoreSentimentNumeric: "80.00",
    scoreContextNumeric: "80.00",
    scoreAccuracy: "80.00",
    scoreComposite: "80.00",
    confidenceIntervals: {},
    vertical: "tradies",
    ...overrides,
  };
}

describe("evaluateTriggers", () => {
  it("returns empty array when all scores are high (no triggers)", () => {
    const result = evaluateTriggers(makeCtx());
    expect(result).toHaveLength(0);
  });

  it("triggers wikipedia-article when scoreFrequency < 40", () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: "30.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).toContain("wikipedia-article");
  });

  it("triggers au-local-citations when scoreFrequency < 50", () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: "45.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).toContain("au-local-citations");
  });

  it("triggers faq-content when scoreContextNumeric < 50", () => {
    const result = evaluateTriggers(makeCtx({ scoreContextNumeric: "40.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).toContain("faq-content");
  });

  it("triggers stale-content when scoreAccuracy < 50", () => {
    const result = evaluateTriggers(makeCtx({ scoreAccuracy: "40.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).toContain("stale-content");
  });

  it("triggers comparison-article when scorePosition < 40", () => {
    const result = evaluateTriggers(makeCtx({ scorePosition: "30.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).toContain("comparison-article");
  });

  it("triggers multiple recommendations when multiple scores are low", () => {
    const result = evaluateTriggers(
      makeCtx({
        scoreFrequency: "20.00",
        scoreAccuracy: "30.00",
        scoreContextNumeric: "30.00",
      }),
    );
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("each triggered recommendation has required fields", () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: "10.00" }));
    for (const rec of result) {
      expect(rec.recommendationKey).toBeTruthy();
      expect(rec.dimension).toBeTruthy();
      expect(rec.title).toBeTruthy();
      expect(rec.action).toBeTruthy();
      expect(["high", "medium", "low"]).toContain(rec.expectedImpactScore);
      expect(Array.isArray(rec.evidenceRefs)).toBe(true);
    }
  });

  it("handles null scores gracefully (defaults to 100 → no triggers)", () => {
    const result = evaluateTriggers(
      makeCtx({
        scoreFrequency: null,
        scorePosition: null,
        scoreAccuracy: null,
      }),
    );
    expect(result).toHaveLength(0);
  });
});
