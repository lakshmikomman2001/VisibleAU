import { expect, test } from "@playwright/test";
import { NO_EVIDENCE } from "../../../../../lib/recommendations/evidence";
import type { TriggerContext } from "../../shared/db";
import { buildRecommendations, db } from "../../shared/db";

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
  test("F06-01: low scores (no checker evidence) produce 10 recommendations with confidence labels", async () => {
    const result = await buildRecommendations(lowScoreCtx(), db);
    expect(result.length).toBe(10);
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
    expect(
      withEvidence.length,
      "At least some recommendations should have evidenceRefs from DB",
    ).toBeGreaterThan(0);
    for (const rec of withEvidence) {
      for (const ref of rec.evidenceRefs) {
        expect(ref.source).toBeTruthy();
        expect(ref.summary).toBeTruthy();
      }
    }
  });

  test("F06-04: anti-pattern keys never appear in results", async () => {
    const blocked = [
      "add-more-keywords",
      "pay-for-ai-ads",
      "submit-to-ai-engines",
      "get-more-backlinks",
      "buy-reviews",
      "run-more-audits",
    ];
    const result = await buildRecommendations(lowScoreCtx(), db);
    const keys = result.map((r) => r.recommendationKey);
    for (const b of blocked) {
      expect(keys).not.toContain(b);
    }
  });

  test("F06-05a: with no checker evidence, nothing is 'confirmed'", async () => {
    const result = await buildRecommendations(lowScoreCtx(), db);
    expect(result.filter((r) => r.confidenceLabel === "confirmed")).toHaveLength(0);
  });

  test("F06-05b: 'confirmed' only where a checker verified the finding", async () => {
    const result = await buildRecommendations(lowScoreCtx(), db, {
      ...NO_EVIDENCE,
      directories: {
        status: "ok",
        data: {
          results: [
            { name: "Hipages", status: "not_listed", url: null, finding: "Not found on Hipages." },
          ],
        },
      },
      wikipedia: {
        status: "ok",
        data: { articleExists: false, articleUrl: null, query: "Test Brand Australia" },
      },
      pageFreshness: {
        status: "ok",
        data: {
          datedPages: [
            {
              url: "https://example.test/pricing",
              lastModified: "2025-01-01T00:00:00.000Z",
              daysSinceModified: 400,
              freshnessRisk: "stale",
            },
          ],
          undatedPageCount: 0,
        },
      },
    });
    const confirmed = result
      .filter((r) => r.confidenceLabel === "confirmed")
      .map((r) => r.recommendationKey)
      .sort();
    expect(confirmed).toEqual(["au-local-citations", "entity-profiles", "stale-content"]);
  });

  test("F06-06: all recommendations have valid expectedImpactScore", async () => {
    const result = await buildRecommendations(lowScoreCtx(), db);
    for (const rec of result) {
      expect(["high", "medium", "low"]).toContain(rec.expectedImpactScore);
    }
  });
});
