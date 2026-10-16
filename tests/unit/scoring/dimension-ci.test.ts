/**
 * Task #46 Phase 1, Part 2 — computeDimensionCIs now uses a Wilson
 * interval everywhere (replacing the Wald/normal-approximation interval
 * that was mathematically exactly zero-width at score = 0 or 100, for
 * ANY sample size -- see lib/scoring/wilson.ts and dimension-ci.ts's own
 * doc comments). The composite CI is a weighted blend of the five
 * dimension CIs (not a proportion-CI formula applied to the composite
 * itself), collapsing to Frequency's own CI when there are 0 mention
 * rows (the "frequency_only" basis).
 *
 * ⚠️ SSS (unchanged by this Phase 1 follow-up): the CI's sample size
 * must be the TRUE independent-n (distinct run_number=1 observations),
 * not the replay-inflated totalCalls/mentionRowCount -- still proven
 * below (a smaller honest n produces a wider interval for the same
 * proportion).
 */
import { describe, expect, it } from "vitest";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";

function baseInput() {
  return {
    freqScore: 20,
    posScore: 50,
    sentScore: 60,
    ctxScore: 55,
    accScore: 25,
    composite: 45,
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
      accWithSourcesCount: 0,
    }).frequency;
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
  });

  it("position/sentiment/context: score = 0 at small n gives a non-zero-width interval (not the Wald 0.0-0.0)", () => {
    const cis = computeDimensionCIs({
      ...baseInput(),
      posScore: 0,
      sentScore: 0,
      ctxScore: 0,
      mentionedCount: 3,
      totalCalls: 40,
      mentionRowCount: 3,
      accWithSourcesCount: 0,
    });
    for (const dim of ["position", "sentiment", "context"] as const) {
      expect(cis[dim].lower, dim).toBe(0);
      expect(cis[dim].upper, dim).toBeGreaterThan(0);
    }
  });

  it("position/sentiment/context: score = 100 at small n gives a non-zero-width interval", () => {
    const cis = computeDimensionCIs({
      ...baseInput(),
      posScore: 100,
      sentScore: 100,
      ctxScore: 100,
      mentionedCount: 3,
      totalCalls: 40,
      mentionRowCount: 3,
      accWithSourcesCount: 3,
    });
    for (const dim of ["position", "sentiment", "context"] as const) {
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
      accWithSourcesCount: 2,
    });
    const inflated = computeDimensionCIs({
      ...baseInput(),
      mentionedCount: 40,
      totalCalls: 200,
      mentionRowCount: 40,
      accWithSourcesCount: 10,
    });

    const honestWidth = honest.frequency.upper - honest.frequency.lower;
    const inflatedWidth = inflated.frequency.upper - inflated.frequency.lower;
    expect(honestWidth).toBeGreaterThan(inflatedWidth);
  });

  it("⚠️ SSS: the same holds for position/sentiment/context/composite -- smaller honest n widens the interval", () => {
    const honest = computeDimensionCIs({
      ...baseInput(),
      mentionedCount: 8,
      totalCalls: 40,
      mentionRowCount: 8,
      accWithSourcesCount: 2,
    });
    const inflated = computeDimensionCIs({
      ...baseInput(),
      mentionedCount: 40,
      totalCalls: 200,
      mentionRowCount: 40,
      accWithSourcesCount: 10,
    });

    for (const dim of ["position", "sentiment", "context", "composite"] as const) {
      const honestWidth = honest[dim].upper - honest[dim].lower;
      const inflatedWidth = inflated[dim].upper - inflated[dim].lower;
      expect(honestWidth, dim).toBeGreaterThan(inflatedWidth);
    }
  });
});

describe("computeDimensionCIs — composite basis", () => {
  it("0 mention rows: composite CI equals Frequency's own Wilson interval, not a blend of zero-width intervals", () => {
    const cis = computeDimensionCIs({
      freqScore: 0,
      posScore: 0,
      sentScore: 0,
      ctxScore: 0,
      accScore: 0,
      composite: 0,
      mentionedCount: 0,
      totalCalls: 180,
      mentionRowCount: 0,
      accWithSourcesCount: 0,
    });
    expect(cis.composite).toEqual(cis.frequency);
    // The whole point: not a point. Frequency's own Wilson interval at
    // n=180 is non-zero-width even though the point estimate is 0.
    expect(cis.composite.upper).toBeGreaterThan(0);
  });

  it("with mentions: composite CI is a DIMENSION_WEIGHTS-weighted blend of each dimension's own CI bounds", () => {
    const input = {
      freqScore: 40,
      posScore: 60,
      sentScore: 70,
      ctxScore: 50,
      accScore: 30,
      composite: 50,
      mentionedCount: 40,
      totalCalls: 100,
      mentionRowCount: 40,
      accWithSourcesCount: 12,
    };
    const cis = computeDimensionCIs(input);

    const expectedLower =
      cis.frequency.lower * 0.25 +
      cis.position.lower * 0.25 +
      cis.sentiment.lower * 0.2 +
      cis.context.lower * 0.15 +
      cis.accuracy.lower * 0.15;
    const expectedUpper =
      cis.frequency.upper * 0.25 +
      cis.position.upper * 0.25 +
      cis.sentiment.upper * 0.2 +
      cis.context.upper * 0.15 +
      cis.accuracy.upper * 0.15;

    expect(cis.composite.lower).toBeCloseTo(expectedLower, 5);
    expect(cis.composite.upper).toBeCloseTo(expectedUpper, 5);
    // The composite CI is never a point unless every one of its inputs
    // genuinely is (it isn't here).
    expect(cis.composite.upper).toBeGreaterThan(cis.composite.lower);
  });
});
