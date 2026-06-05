import { test, expect } from "@playwright/test";
import { buildRecommendations, db } from "../../shared/db";
import type { TriggerContext } from "../../shared/db";

function lowScoreCtx(): TriggerContext {
  return {
    scoreFrequency: "10.00",
    scorePosition: "10.00",
    scoreSentimentNumeric: "60.00",
    scoreContextNumeric: "10.00",
    scoreAccuracy: "10.00",
    scoreComposite: "10.00",
    confidenceIntervals: {},
    vertical: "tradies",
  };
}

function highScoreCtx(): TriggerContext {
  return {
    scoreFrequency: "90.00",
    scorePosition: "90.00",
    scoreSentimentNumeric: "90.00",
    scoreContextNumeric: "90.00",
    scoreAccuracy: "90.00",
    scoreComposite: "90.00",
    confidenceIntervals: {},
    vertical: "tradies",
  };
}

test.describe("F06: buildRecommendations — full pipeline", () => {
  test("F06-01: low scores produce 11 recommendations with confidence labels", async () => {
    const result = await buildRecommendations(lowScoreCtx(), db);
    expect(result.length).toBe(11);
    for (const rec of result) {
      expect(["confirmed", "likely", "hypothesis"]).toContain(rec.confidenceLabel);
      expect(rec.recommendationKey).toBeTruthy();
      expect(rec.dimension).toBeTruthy();
    }
  });

  test("F06-02: high scores produce 0 recommendations", async () => {
    const result = await buildRecommendations(highScoreCtx(), db);
    expect(result).toHaveLength(0);
  });

  test("F06-03: evidenceRefs populated from recommendation_research table", async () => {
    const result = await buildRecommendations(lowScoreCtx(), db);
    const withEvidence = result.filter((r) => r.evidenceRefs.length > 0);
    expect(withEvidence.length, "At least some recommendations should have evidenceRefs from DB").toBeGreaterThan(0);
    for (const rec of withEvidence) {
      for (const ref of rec.evidenceRefs) {
        expect(ref.source).toBeTruthy();
        expect(ref.summary).toBeTruthy();
      }
    }
  });

  test("F06-04: anti-pattern keys never appear in results", async () => {
    const blocked = [
      "add-more-keywords", "pay-for-ai-ads", "submit-to-ai-engines",
      "get-more-backlinks", "buy-reviews", "run-more-audits",
    ];
    const result = await buildRecommendations(lowScoreCtx(), db);
    const keys = result.map((r) => r.recommendationKey);
    for (const b of blocked) {
      expect(keys).not.toContain(b);
    }
  });

  test("F06-05: confirmed recommendations have wikipedia-article, au-local-citations, stale-content", async () => {
    const result = await buildRecommendations(lowScoreCtx(), db);
    const confirmed = result.filter((r) => r.confidenceLabel === "confirmed").map((r) => r.recommendationKey).sort();
    expect(confirmed).toEqual(["au-local-citations", "stale-content", "wikipedia-article"]);
  });

  test("F06-06: all recommendations have valid expectedImpactScore", async () => {
    const result = await buildRecommendations(lowScoreCtx(), db);
    for (const rec of result) {
      expect(["high", "medium", "low"]).toContain(rec.expectedImpactScore);
    }
  });
});
