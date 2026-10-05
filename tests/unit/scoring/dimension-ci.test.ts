/**
 * ⚠️ SSS — the 95% CIs used a correct formula (Wilson / normal-approx) but
 * an inflated sample size: `totalCalls`/`mentionRowCount` counted 4
 * cache-replayed "runs" per prompt as independent trials, when the LLM
 * cache key (sha256(prompt + model), no run index -- confirmed task AAA)
 * means only run 1 of each (engine, prompt) pair is ever a real call. The
 * true independent-n is ~totalCalls/5, so the old margin was ~sqrt(5)
 * tighter than the evidence actually supports. This file proves the fix
 * at the `computeDimensionCIs` level: feeding the honest n widens the
 * interval by the expected ratio, without touching any point estimate
 * (callers pass the same already-computed score; computeDimensionCIs
 * never recomputes it from the counts).
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

describe("⚠️ SSS — computeDimensionCIs: honest n widens the interval, scores are untouched", () => {
  it("n=40 (true independent samples) produces a WIDER interval than n=200 (replay-inflated) for the same proportion", () => {
    // Same underlying 20% mention rate either way -- 8/40 distinct calls
    // mentioned == 40/200 replay-inflated calls mentioned, because every
    // replay is byte-identical to its run-1 original.
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

    // The margin scales with 1/sqrt(n) -- going from n=200 to n=40 (a
    // factor of 5) should widen the margin by close to sqrt(5) ~= 2.236.
    const ratio = honestWidth / inflatedWidth;
    expect(ratio).toBeGreaterThan(1.9);
    expect(ratio).toBeLessThan(2.6);
  });

  it("the normal-approx dimensions (position/sentiment/context/composite) widen the same way for the same score at n=40 vs n=200", () => {
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
      const ratio = honestWidth / inflatedWidth;
      expect(ratio, dim).toBeCloseTo(Math.sqrt(200 / 40), 1);
    }
  });

  it("computeDimensionCIs never recomputes the point estimate -- posScore/sentScore/ctxScore/composite pass straight through as the interval center input, unaffected by n", () => {
    // symmetricCI takes the score directly; changing only n must not
    // change which score the interval is centered near regardless of n.
    const n40 = computeDimensionCIs({ ...baseInput(), mentionedCount: 8, totalCalls: 40, mentionRowCount: 8, accWithSourcesCount: 2 });
    const n200 = computeDimensionCIs({ ...baseInput(), mentionedCount: 40, totalCalls: 200, mentionRowCount: 40, accWithSourcesCount: 10 });

    const midpoint = (ci: { lower: number; upper: number }) => (ci.lower + ci.upper) / 2;
    expect(midpoint(n40.position)).toBeCloseTo(midpoint(n200.position), 0);
    expect(midpoint(n40.sentiment)).toBeCloseTo(midpoint(n200.sentiment), 0);
    expect(midpoint(n40.context)).toBeCloseTo(midpoint(n200.context), 0);
    expect(midpoint(n40.composite)).toBeCloseTo(midpoint(n200.composite), 0);
  });
});
