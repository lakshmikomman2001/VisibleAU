/**
 * ⚠️ HH — selectOrganicCitations excludes branded-prompt calls from EVERY
 * dimension's scoring input, not just Frequency, before Frequency/
 * Position/Sentiment/Context/Accuracy are computed.
 *
 * Task EE found run-audit-inline.ts and run-audit.ts count every call
 * toward mentionedCount/totalCalls/allPositions/allSentiments/allContexts
 * with no is_branded_prompt check, even though each citation already
 * carries that flag -- structurally the same unfixed gap AA (SoV) and DD
 * (Mention panel) fixed elsewhere. It's currently inert (PROMPTS_PER_AUDIT
 * = 10, and the lowest-ranked 10 vertical-pack templates are all neutral --
 * the first branded template is rank 34), so this task fixes it
 * defensively, at the source, before it can ever inflate a real score.
 */
import { describe, expect, it } from "vitest";
import {
  type AuditCallOutcome,
  selectOrganicCitations,
} from "@/lib/audit/organic-citations";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { compositeVisibilityScore } from "@/lib/scoring/composite";
import { contextDimensionScore } from "@/lib/scoring/context";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { sentimentDimensionScore } from "@/lib/scoring/sentiment";

function outcome(overrides: Partial<AuditCallOutcome>): AuditCallOutcome {
  return {
    isBranded: false,
    brandMentioned: false,
    position: null,
    sentimentLabel: "neutral",
    contextLabel: "absent",
    citedSources: [],
    runNumber: 1,
    ...overrides,
  };
}

function scoreAll(organic: ReturnType<typeof selectOrganicCitations>) {
  const freq = frequencyDimensionScore(organic.mentionedCount, organic.totalCalls);
  const pos = positionDimensionScore(organic.positions);
  const sent = sentimentDimensionScore(
    organic.sentiments as Parameters<typeof sentimentDimensionScore>[0],
  );
  const ctx = contextDimensionScore(
    organic.contexts as Parameters<typeof contextDimensionScore>[0],
  );
  const acc = accuracyDimensionScore(organic.citationData);
  const composite = compositeVisibilityScore({
    frequency: freq,
    position: pos,
    sentiment: sent,
    context: ctx,
    accuracy: acc,
  });
  return { freq, pos, sent, ctx, acc, composite };
}

describe("⚠️ HH — selectOrganicCitations", () => {
  it("branded calls are excluded from every count, not just mentionedCount", () => {
    const outcomes: AuditCallOutcome[] = [
      // 2 branded, guaranteed mentions -- must not survive filtering.
      outcome({
        isBranded: true,
        brandMentioned: true,
        position: 1,
        sentimentLabel: "positive",
        contextLabel: "recommended",
        citedSources: [{ domain: "x.com" }],
      }),
      outcome({
        isBranded: true,
        brandMentioned: true,
        position: 1,
        sentimentLabel: "positive",
        contextLabel: "recommended",
      }),
      // 4 neutral, 1 mentioned.
      outcome({ isBranded: false, brandMentioned: false }),
      outcome({ isBranded: false, brandMentioned: false }),
      outcome({ isBranded: false, brandMentioned: false }),
      outcome({
        isBranded: false,
        brandMentioned: true,
        position: 3,
        sentimentLabel: "neutral",
        contextLabel: "listed",
      }),
    ];

    const organic = selectOrganicCitations(outcomes);

    expect(organic.totalCalls).toBe(4); // only the 4 neutral calls
    expect(organic.mentionedCount).toBe(1); // only the 1 neutral mention
    expect(organic.positions).toEqual([3]);
    expect(organic.sentiments).toEqual(["neutral"]);
    expect(organic.contexts).toEqual(["listed"]);
    expect(organic.citationData).toHaveLength(4);
    // The branded calls' citedSources ([{domain: "x.com"}]) must not have
    // leaked into the organic pool.
    expect(
      organic.citationData.some(
        (c) => Array.isArray(c.citedSources) && c.citedSources.some((s) => s.domain === "x.com"),
      ),
    ).toBe(false);
  });

  it("a brand mentioned ONLY via branded prompts -> organic Frequency 0, composite drops accordingly", () => {
    const outcomes: AuditCallOutcome[] = [
      outcome({ isBranded: true, brandMentioned: true, position: 1, sentimentLabel: "positive", contextLabel: "recommended" }),
      outcome({ isBranded: true, brandMentioned: true, position: 1, sentimentLabel: "positive", contextLabel: "recommended" }),
      outcome({ isBranded: false, brandMentioned: false }),
      outcome({ isBranded: false, brandMentioned: false }),
      outcome({ isBranded: false, brandMentioned: false }),
    ];

    const organic = selectOrganicCitations(outcomes);
    const organicScores = scoreAll(organic);

    expect(organicScores.freq).toBe(0);
    expect(organicScores.composite).toBe(0);

    // The naive (pre-fix) computation over ALL outcomes would have scored
    // this as a visible, recommended brand -- the exact inflation this
    // task closes.
    const naiveFreq = frequencyDimensionScore(
      outcomes.filter((o) => o.brandMentioned).length,
      outcomes.length,
    );
    expect(naiveFreq).toBeGreaterThan(0);
    expect(naiveFreq).not.toBe(organicScores.freq);
  });

  it("all-branded input -> totalCalls 0, every dimension 0, no divide-by-zero / NaN", () => {
    const outcomes: AuditCallOutcome[] = [
      outcome({ isBranded: true, brandMentioned: true, position: 1 }),
      outcome({ isBranded: true, brandMentioned: true, position: 1 }),
    ];

    const organic = selectOrganicCitations(outcomes);
    expect(organic.totalCalls).toBe(0);
    expect(organic.mentionedCount).toBe(0);

    const scores = scoreAll(organic);
    for (const [key, value] of Object.entries(scores)) {
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBe(0);
    }
  });

  it("regression: an all-neutral outcome set is a byte-for-byte no-op", () => {
    // CORRECTED (task QQ): this does NOT describe Bondi's real audits --
    // Bondi has a classification/promptPack, so it takes the
    // buildPromptPack path, which DOES produce branded prompts (see
    // tests/unit/audit/flag-branded-prompts.test.ts). It genuinely
    // describes the OTHER path: a brand with no classification/promptPack,
    // scored from the vertical pack's lowest-ranked 10 templates -- none
    // branded at PROMPTS_PER_AUDIT=10 (first branded template is rank 34).
    // For that input shape, filtering changes nothing: every aggregate is
    // IDENTICAL to the naive pre-fix computation over the same data.
    const outcomes: AuditCallOutcome[] = [];
    // 4 engines x 9 prompts x 5 runs = 180 calls, ~44% mentioned -- an
    // illustrative no-classification-path shape, all isBranded: false.
    for (let i = 0; i < 180; i++) {
      const mentioned = i % 9 < 4; // ~44% mention rate, deterministic
      outcomes.push(
        outcome({
          isBranded: false,
          brandMentioned: mentioned,
          position: mentioned ? (i % 5) + 1 : null,
          sentimentLabel: mentioned ? "positive" : "neutral",
          contextLabel: mentioned ? "listed" : "absent",
          citedSources: mentioned ? [{ domain: "hipages.com.au" }] : [],
          runNumber: (i % 5) + 1,
        }),
      );
    }

    const organic = selectOrganicCitations(outcomes);

    // No-op: organic pool === the full input, because nothing is branded.
    expect(organic.totalCalls).toBe(outcomes.length);
    expect(organic.mentionedCount).toBe(outcomes.filter((o) => o.brandMentioned).length);

    const organicScores = scoreAll(organic);

    // The naive pre-fix path: feed the SAME raw arrays straight into the
    // scorers, with no filtering step at all.
    const naiveFreq = frequencyDimensionScore(
      outcomes.filter((o) => o.brandMentioned).length,
      outcomes.length,
    );
    const naivePositions = outcomes.filter((o) => o.brandMentioned).map((o) => o.position);
    const naiveSentiments = outcomes.filter((o) => o.brandMentioned).map((o) => o.sentimentLabel);
    const naiveContexts = outcomes.filter((o) => o.brandMentioned).map((o) => o.contextLabel);
    const naiveCitationData = outcomes.map((o) => ({
      brandMentioned: o.brandMentioned,
      citedSources: o.citedSources,
    }));

    expect(organicScores.freq).toBe(naiveFreq);
    expect(organicScores.pos).toBe(
      positionDimensionScore(naivePositions as Parameters<typeof positionDimensionScore>[0]),
    );
    expect(organicScores.sent).toBe(
      sentimentDimensionScore(naiveSentiments as Parameters<typeof sentimentDimensionScore>[0]),
    );
    expect(organicScores.ctx).toBe(
      contextDimensionScore(naiveContexts as Parameters<typeof contextDimensionScore>[0]),
    );
    expect(organicScores.acc).toBe(accuracyDimensionScore(naiveCitationData));

    // ~44.4% mention rate -- illustrative, not a claim about any real audit.
    expect(organicScores.freq).toBeCloseTo(44.4, 1);
  });
});

describe("⚠️ SSS — distinct-sample counts (the true independent-n for CI width)", () => {
  it("8 distinct (engine, prompt) pairs x 5 replayed runs = 40 organic calls, but only 8 distinct samples", () => {
    // Simulates the real cache-replay shape (task AAA): run 1 of each pair
    // is the one real LLM call; runs 2-5 are byte-identical replays of
    // run 1's outcome, since the cache key has no run index.
    const outcomes: AuditCallOutcome[] = [];
    for (let pair = 0; pair < 8; pair++) {
      const mentioned = pair < 3; // 3 of 8 distinct pairs mention the brand
      for (let run = 1; run <= 5; run++) {
        outcomes.push(
          outcome({
            brandMentioned: mentioned,
            position: mentioned ? 2 : null,
            sentimentLabel: mentioned ? "positive" : "neutral",
            contextLabel: mentioned ? "listed" : "absent",
            citedSources: mentioned ? [{ domain: "hipages.com.au" }] : [],
            runNumber: run,
          }),
        );
      }
    }

    const organic = selectOrganicCitations(outcomes);

    // Point estimates: unchanged, still counted across all 40 (replay-
    // inflated) rows -- this is correct, not a bug, because every replay
    // is identical to its run-1 original.
    expect(organic.totalCalls).toBe(40);
    expect(organic.mentionedCount).toBe(15); // 3 mentioned pairs x 5 runs

    // The new, honest counts: only the 8 distinct runNumber===1 rows.
    expect(organic.distinctSampleCount).toBe(8);
    expect(organic.distinctMentionedCount).toBe(3);
    expect(organic.distinctAccWithSourcesCount).toBe(3);

    // The proportion is identical either way -- replays preserve it
    // exactly, which is why point estimates (scores) don't need to change.
    expect(organic.mentionedCount / organic.totalCalls).toBeCloseTo(
      organic.distinctMentionedCount / organic.distinctSampleCount,
      10,
    );
  });

  it("a call with no companion replays (runNumber=1 only, e.g. a genuinely single-run tier) counts itself once in both totals", () => {
    const outcomes: AuditCallOutcome[] = [
      outcome({ brandMentioned: true, runNumber: 1, citedSources: [{ domain: "x.com" }] }),
      outcome({ brandMentioned: false, runNumber: 1 }),
    ];
    const organic = selectOrganicCitations(outcomes);
    expect(organic.distinctSampleCount).toBe(2);
    expect(organic.distinctMentionedCount).toBe(1);
    expect(organic.distinctAccWithSourcesCount).toBe(1);
  });

  it("branded calls are excluded from the distinct counts too, same as the existing totals", () => {
    const outcomes: AuditCallOutcome[] = [
      outcome({ isBranded: true, brandMentioned: true, runNumber: 1 }),
      outcome({ isBranded: true, brandMentioned: true, runNumber: 2 }),
      outcome({ isBranded: false, brandMentioned: false, runNumber: 1 }),
      outcome({ isBranded: false, brandMentioned: false, runNumber: 2 }),
    ];
    const organic = selectOrganicCitations(outcomes);
    expect(organic.distinctSampleCount).toBe(1); // only the one organic runNumber===1 row
  });
});
