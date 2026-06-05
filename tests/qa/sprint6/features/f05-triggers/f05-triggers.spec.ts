import { test, expect } from "@playwright/test";
import { evaluateTriggers } from "../../shared/db";
import type { TriggerContext } from "../../shared/db";

function makeCtx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    scoreFrequency: "80.00", scorePosition: "80.00", scoreSentimentNumeric: "80.00",
    scoreContextNumeric: "80.00", scoreAccuracy: "80.00", scoreComposite: "80.00",
    confidenceIntervals: {}, vertical: "tradies", ...overrides,
  };
}

test.describe("F05: Trigger evaluation — score thresholds → action types", () => {
  test("F05-01: high scores → no triggers", async () => {
    expect(evaluateTriggers(makeCtx())).toHaveLength(0);
  });

  test("F05-02: all scores at 10 → all 11 action types triggered", async () => {
    const result = evaluateTriggers(makeCtx({
      scoreFrequency: "10.00", scorePosition: "10.00", scoreAccuracy: "10.00",
      scoreSentimentNumeric: "60.00", scoreContextNumeric: "10.00", scoreComposite: "10.00",
    }));
    expect(result.length).toBe(11);
    const keys = result.map((r) => r.recommendationKey).sort();
    expect(keys).toEqual([
      "au-local-citations", "cited-statistics", "comparison-article", "expert-quotes",
      "faq-content", "linkedin-presence", "medium-presence", "press-mentions",
      "reddit-absence", "stale-content", "wikipedia-article",
    ]);
  });

  test("F05-03: scoreFrequency < 40 triggers wikipedia-article", async () => {
    const keys = evaluateTriggers(makeCtx({ scoreFrequency: "30.00" })).map((r) => r.recommendationKey);
    expect(keys).toContain("wikipedia-article");
  });

  test("F05-04: scoreAccuracy < 50 triggers stale-content", async () => {
    const keys = evaluateTriggers(makeCtx({ scoreAccuracy: "40.00" })).map((r) => r.recommendationKey);
    expect(keys).toContain("stale-content");
  });

  test("F05-05: null scores default to 100 → no triggers", async () => {
    expect(evaluateTriggers(makeCtx({ scoreFrequency: null, scoreAccuracy: null }))).toHaveLength(0);
  });

  test("F05-06: each recommendation has required fields", async () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: "10.00" }));
    for (const rec of result) {
      expect(rec.recommendationKey).toBeTruthy();
      expect(rec.dimension).toBeTruthy();
      expect(rec.title).toBeTruthy();
      expect(rec.action).toBeTruthy();
      expect(["high", "medium", "low"]).toContain(rec.expectedImpactScore);
    }
  });

  test("F05-07: press-mentions requires both low frequency AND positive sentiment", async () => {
    const withGoodSentiment = evaluateTriggers(makeCtx({ scoreFrequency: "30.00", scoreSentimentNumeric: "60.00" }));
    expect(withGoodSentiment.map((r) => r.recommendationKey)).toContain("press-mentions");
    const withBadSentiment = evaluateTriggers(makeCtx({ scoreFrequency: "30.00", scoreSentimentNumeric: "40.00" }));
    expect(withBadSentiment.map((r) => r.recommendationKey)).not.toContain("press-mentions");
  });
});
