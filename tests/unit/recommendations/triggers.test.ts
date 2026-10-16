import { describe, expect, it } from "vitest";
import { evaluateTriggers, UNIVERSAL_RULE_KEYS } from "@/lib/recommendations/triggers";
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

// Score-threshold behaviour with NO checker evidence (evaluateTriggers'
// default). Checker-backed behaviour lives in evidence-driven-rules.test.ts.
describe("evaluateTriggers (no checker evidence)", () => {
  it("still has exactly 11 universal rules", () => {
    expect(UNIVERSAL_RULE_KEYS).toHaveLength(11);
  });

  it("returns empty array when all scores are high (no triggers)", () => {
    const result = evaluateTriggers(makeCtx());
    expect(result).toHaveLength(0);
  });

  it("scoreFrequency < 40 with no Wikipedia check -> entity-profiles alternatives, never the Wikipedia-article ask", () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: "30.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).toContain("entity-profiles");
    expect(keys).not.toContain("wikipedia-article");
  });

  it("triggers au-local-citations (unverified fallback) when scoreFrequency < 50", () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: "45.00" }));
    const rec = result.find((r) => r.recommendationKey === "au-local-citations");
    expect(rec?.confidenceBasis).toBe("inferred");
  });

  // Task #46 Phase 3, Part C: Context has no real classifier behind it
  // (lib/scoring/dimension-result.ts) -- "faq-content" reads it, so it's
  // now permanently disabled, regardless of how low scoreContextNumeric
  // is (same gate as insufficient_data, but unconditional).
  it("faq-content never fires -- Context is permanently not_measured", () => {
    const result = evaluateTriggers(makeCtx({ scoreContextNumeric: "40.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).not.toContain("faq-content");
  });

  // Task #46 Phase 3, Part C: Sentiment has no real classifier behind it
  // either -- "press-mentions" reads it, so it's permanently disabled too.
  it("press-mentions never fires -- Sentiment is permanently not_measured", () => {
    const result = evaluateTriggers(
      makeCtx({ scoreFrequency: "20.00", scoreSentimentNumeric: "90.00" }),
    );
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).not.toContain("press-mentions");
  });

  it("stale-content no longer fires from a Source-citation score -- only from real stale pages", () => {
    const result = evaluateTriggers(makeCtx({ scoreAccuracy: "10.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).not.toContain("stale-content");
    expect(keys).toContain("expert-quotes");
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
      expect(["verified", "inferred", "speculative"]).toContain(rec.confidenceBasis);
    }
  });

  it("with no checker evidence, nothing is ever 'verified'", () => {
    const result = evaluateTriggers(
      makeCtx({
        scoreFrequency: "5.00",
        scorePosition: "5.00",
        scoreAccuracy: "5.00",
        scoreContextNumeric: "5.00",
        scoreSentimentNumeric: "60.00",
      }),
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.confidenceBasis !== "verified")).toBe(true);
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
