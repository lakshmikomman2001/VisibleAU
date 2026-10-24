import { describe, expect, it } from "vitest";
import {
  CITED_STATISTICS_SOURCED_SHARE_BELOW,
  COMPARISON_ARTICLE_MEDIAN_RANK_ABOVE,
  EXPERT_QUOTES_SOURCED_SHARE_BELOW,
  evaluateTriggers,
  UNIVERSAL_RULE_KEYS,
} from "@/lib/recommendations/triggers";
import type { TriggerContext } from "@/lib/recommendations/types";
import { type MentionDetailCounts, SMALL_SAMPLE_MENTIONS } from "@/lib/scoring/measured-display";

/** 10 verified mentions, all ranked at a median of #2, all with a source:
 * none of the measured Position / Source-citation rules fire. */
const STRONG_MENTIONS: MentionDetailCounts = {
  mentionedCount: 10,
  rankedCount: 10,
  medianPosition: 2,
  sourcedCount: 10,
};

function makeCtx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    scoreFrequency: "80.00",
    scoreSentimentNumeric: "80.00",
    scoreContextNumeric: "80.00",
    scoreComposite: "80.00",
    confidenceIntervals: {},
    vertical: "tradies",
    mentionDetail: STRONG_MENTIONS,
    ...overrides,
  };
}

function keysFor(mentionDetail: MentionDetailCounts | null): string[] {
  return evaluateTriggers(makeCtx({ mentionDetail })).map((r) => r.recommendationKey);
}

// Score-threshold behaviour with NO checker evidence (evaluateTriggers'
// default). Checker-backed behaviour lives in evidence-driven-rules.test.ts.
describe("evaluateTriggers (no checker evidence)", () => {
  it("still has exactly 11 universal rules", () => {
    expect(UNIVERSAL_RULE_KEYS).toHaveLength(11);
  });

  it("returns empty array when all scores and counts are strong (no triggers)", () => {
    const result = evaluateTriggers(makeCtx());
    expect(result).toHaveLength(0);
  });

  it("scoreFrequency < 40 with no Wikipedia check -> entity-profiles alternatives, never the Wikipedia-article ask", () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: "30.00" }));
    const keys = result.map((r) => r.recommendationKey);
    expect(keys).toContain("entity-profiles");
    expect(keys).not.toContain("wikipedia-article");
  });

  // Vunnara (21 Oct, Part E): directory-visibility (replaces the retired
  // au-local-citations) has no score-only fallback at all -- it is
  // entirely evidence-driven (reads: [], threshold: () => false), so no
  // score, however low, ever fires it without real Part C/D evidence.
  // Checker-backed behaviour lives in evidence-driven-rules.test.ts.
  it("directory-visibility never fires from score alone, whatever scoreFrequency is", () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: "1.00" }));
    expect(result.find((r) => r.recommendationKey === "directory-visibility")).toBeUndefined();
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

  it("stale-content never fires from a low sourced share -- only from real stale pages", () => {
    const keys = keysFor({ ...STRONG_MENTIONS, sourcedCount: 1 });
    expect(keys).not.toContain("stale-content");
    expect(keys).toContain("expert-quotes");
  });

  it("triggers multiple recommendations when several measures are low", () => {
    const result = evaluateTriggers(
      makeCtx({
        scoreFrequency: "20.00",
        scoreContextNumeric: "30.00",
        mentionDetail: { mentionedCount: 6, rankedCount: 0, medianPosition: null, sourcedCount: 0 },
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
        scoreContextNumeric: "5.00",
        scoreSentimentNumeric: "60.00",
        mentionDetail: { mentionedCount: 8, rankedCount: 0, medianPosition: null, sourcedCount: 0 },
      }),
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.confidenceBasis !== "verified")).toBe(true);
  });

  it("handles null scores and unknown counts gracefully (no triggers)", () => {
    const result = evaluateTriggers(makeCtx({ scoreFrequency: null, mentionDetail: null }));
    expect(result).toHaveLength(0);
  });
});

// Audit #36 follow-up -- the Position and Source-citation rules read the
// measured counts, never a 0-100 score, and never fire below
// SMALL_SAMPLE_MENTIONS (5) mentions.
describe("measured Position / Source-citation rules", () => {
  it("the thresholds keep each rule's intent", () => {
    expect(SMALL_SAMPLE_MENTIONS).toBe(5);
    // score_accuracy was the sourced share x 100: < 60 and < 70 map exactly.
    expect(EXPERT_QUOTES_SOURCED_SHARE_BELOW).toBe(0.6);
    expect(CITED_STATISTICS_SOURCED_SHARE_BELOW).toBe(0.7);
    // score_position < 40 meant a median worse than #31; now worse than #5.
    expect(COMPARISON_ARTICLE_MEDIAN_RANK_ABOVE).toBe(5);
  });

  describe("expert-quotes: under 60% of mentions linked a source", () => {
    it("fires at 5 of 10 (50%)", () => {
      expect(keysFor({ ...STRONG_MENTIONS, sourcedCount: 5 })).toContain("expert-quotes");
    });
    it("does not fire at 6 of 10 (60%)", () => {
      expect(keysFor({ ...STRONG_MENTIONS, sourcedCount: 6 })).not.toContain("expert-quotes");
    });
    it("does not fire below 5 mentions, even at 0 of 4", () => {
      const keys = keysFor({
        mentionedCount: 4,
        rankedCount: 4,
        medianPosition: 2,
        sourcedCount: 0,
      });
      expect(keys).not.toContain("expert-quotes");
    });
  });

  describe("cited-statistics: under 70% of mentions linked a source", () => {
    it("fires at 6 of 10 (60%)", () => {
      expect(keysFor({ ...STRONG_MENTIONS, sourcedCount: 6 })).toContain("cited-statistics");
    });
    it("does not fire at 7 of 10 (70%)", () => {
      expect(keysFor({ ...STRONG_MENTIONS, sourcedCount: 7 })).not.toContain("cited-statistics");
    });
    it("does not fire below 5 mentions, even at 1 of 3", () => {
      const keys = keysFor({
        mentionedCount: 3,
        rankedCount: 3,
        medianPosition: 2,
        sourcedCount: 1,
      });
      expect(keys).not.toContain("cited-statistics");
    });
  });

  describe("comparison-article: median rank worse than #5, or never in a ranked list", () => {
    it("fires at a median of #6 over 5 ranked mentions", () => {
      expect(keysFor({ ...STRONG_MENTIONS, rankedCount: 5, medianPosition: 6 })).toContain(
        "comparison-article",
      );
    });
    it("does not fire at a median of #5", () => {
      expect(keysFor({ ...STRONG_MENTIONS, rankedCount: 5, medianPosition: 5 })).not.toContain(
        "comparison-article",
      );
    });
    it("fires when 5+ mentions were never in a ranked list", () => {
      expect(
        keysFor({ mentionedCount: 5, rankedCount: 0, medianPosition: null, sourcedCount: 5 }),
      ).toContain("comparison-article");
    });
    it("does not fire on fewer than 5 ranked mentions, however low the rank", () => {
      expect(keysFor({ ...STRONG_MENTIONS, rankedCount: 4, medianPosition: 9 })).not.toContain(
        "comparison-article",
      );
    });
    it("does not fire below 5 mentions, even with none ranked", () => {
      expect(
        keysFor({ mentionedCount: 4, rankedCount: 0, medianPosition: null, sourcedCount: 4 }),
      ).not.toContain("comparison-article");
    });
  });

  it("Audit #36 (3 mentions, #4, 3 of 3 sourced) fires none of them", () => {
    const keys = keysFor({ mentionedCount: 3, rankedCount: 3, medianPosition: 4, sourcedCount: 3 });
    for (const key of ["expert-quotes", "cited-statistics", "comparison-article"]) {
      expect(keys).not.toContain(key);
    }
  });

  it("never fires as High", () => {
    const result = evaluateTriggers(
      makeCtx({
        mentionDetail: {
          mentionedCount: 20,
          rankedCount: 0,
          medianPosition: null,
          sourcedCount: 0,
        },
      }),
    );
    const measured = result.filter((r) =>
      ["expert-quotes", "cited-statistics", "comparison-article"].includes(r.recommendationKey),
    );
    expect(measured).toHaveLength(3);
    expect(measured.every((r) => r.expectedImpactScore !== "high")).toBe(true);
  });
});
