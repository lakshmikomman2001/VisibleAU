/**
 * Task #46 Phase 1, Part 2 — computeDimensionCIs now uses a Wilson
 * interval everywhere (replacing the Wald/normal-approximation interval
 * that was mathematically exactly zero-width at score = 0 or 100, for
 * ANY sample size -- see lib/scoring/wilson.ts and dimension-ci.ts's own
 * doc comments).
 *
 * Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
 * the headline CI is now unconditionally Frequency's own Wilson
 * interval -- no more DIMENSION_WEIGHTS-weighted blend of all five, no
 * more "frequency_only" vs "weighted" distinction.
 *
 * ⚠️ SSS (unchanged by this Phase 1 follow-up): the CI's sample size
 * must be the TRUE independent-n (distinct run_number=1 observations),
 * not the replay-inflated totalCalls/mentionRowCount -- still proven
 * below (a smaller honest n produces a wider interval for the same
 * proportion).
 *
 * Audit #36 follow-up: no Position or Source-citation interval any more --
 * those have no 0-100 value (COUNTS_ONLY_DIMENSION).
 */
import { describe, expect, it } from "vitest";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";

function baseInput() {
  return {
    freqScore: 20,
    sentScore: 60,
    ctxScore: 55,
  };
}

describe("computeDimensionCIs — Wilson everywhere, never a zero-width interval at a 0/100 boundary", () => {
  it("frequency: 0/N mentions at small n still gives a non-zero-width interval", () => {
    const ci = computeDimensionCIs({
      ...baseInput(),
      freqScore: 0,
      mentionedCount: 0,
      totalCalls: 10,
      mentionRowCount: 0,
    }).frequency;
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
  });

  it("sentiment/context: score = 0 at small n gives a non-zero-width interval (not the Wald 0.0-0.0)", () => {
    const cis = computeDimensionCIs({
      ...baseInput(),
      sentScore: 0,
      ctxScore: 0,
      mentionedCount: 3,
      totalCalls: 40,
      mentionRowCount: 3,
    });
    for (const dim of ["sentiment", "context"] as const) {
      expect(cis[dim].lower, dim).toBe(0);
      expect(cis[dim].upper, dim).toBeGreaterThan(0);
    }
  });

  it("sentiment/context: score = 100 at small n gives a non-zero-width interval", () => {
    const cis = computeDimensionCIs({
      ...baseInput(),
      sentScore: 100,
      ctxScore: 100,
      mentionedCount: 3,
      totalCalls: 40,
      mentionRowCount: 3,
    });
    for (const dim of ["sentiment", "context"] as const) {
      expect(cis[dim].upper, dim).toBe(100);
      expect(cis[dim].lower, dim).toBeLessThan(100);
    }
  });

  it("⚠️ SSS: honest n=40 produces a WIDER frequency interval than replay-inflated n=200 for the same proportion", () => {
    const honest = computeDimensionCIs({
      ...baseInput(),
      mentionedCount: 8,
      totalCalls: 40,
      mentionRowCount: 8,
    });
    const inflated = computeDimensionCIs({
      ...baseInput(),
      mentionedCount: 40,
      totalCalls: 200,
      mentionRowCount: 40,
    });

    const honestWidth = honest.frequency.upper - honest.frequency.lower;
    const inflatedWidth = inflated.frequency.upper - inflated.frequency.lower;
    expect(honestWidth).toBeGreaterThan(inflatedWidth);
  });

  it("⚠️ SSS: the same holds for sentiment/context/headline -- smaller honest n widens the interval", () => {
    const honest = computeDimensionCIs({
      ...baseInput(),
      mentionedCount: 8,
      totalCalls: 40,
      mentionRowCount: 8,
    });
    const inflated = computeDimensionCIs({
      ...baseInput(),
      mentionedCount: 40,
      totalCalls: 200,
      mentionRowCount: 40,
    });

    for (const dim of ["sentiment", "context", "headline"] as const) {
      const honestWidth = honest[dim].upper - honest[dim].lower;
      const inflatedWidth = inflated[dim].upper - inflated[dim].lower;
      expect(honestWidth, dim).toBeGreaterThan(inflatedWidth);
    }
  });
});

describe("computeDimensionCIs — no Position or Source-citation interval", () => {
  it("returns no position or accuracy key", () => {
    const cis = computeDimensionCIs({
      ...baseInput(),
      mentionedCount: 3,
      totalCalls: 40,
      mentionRowCount: 3,
    });
    expect(Object.keys(cis).sort()).toEqual(["context", "frequency", "headline", "sentiment"]);
  });
});

describe("computeDimensionCIs — the headline CI", () => {
  it("is always Frequency's own Wilson interval, mention rows or not", () => {
    const zeroMentions = computeDimensionCIs({
      freqScore: 0,
      sentScore: 0,
      ctxScore: 0,
      mentionedCount: 0,
      totalCalls: 180,
      mentionRowCount: 0,
    });
    expect(zeroMentions.headline).toEqual(zeroMentions.frequency);
    // The whole point: not a point. Frequency's own Wilson interval at
    // n=180 is non-zero-width even though the point estimate is 0.
    expect(zeroMentions.headline.upper).toBeGreaterThan(0);

    const withMentions = computeDimensionCIs({
      freqScore: 40,
      sentScore: 70,
      ctxScore: 50,
      mentionedCount: 40,
      totalCalls: 100,
      mentionRowCount: 40,
    });
    expect(withMentions.headline).toEqual(withMentions.frequency);
  });
});
