/**
 * Vunnara (19 Oct, post-aa83b3a) -- "the headline is the mention rate".
 *
 * Production audit #30 (Omega Services): 6 of 37 successful organic
 * answers mentioned the brand (Frequency 16.2), with Position 71.0 and
 * Source citation 100.0 measured only over those 6 mentions. The old
 * weighted blend produced a headline of 56.6 -- and was NOT monotonic:
 * 1 of 37 mentions, ranked first and cited, would have scored ~62,
 * HIGHER than the more-visible 6-of-37 case. Sri's decision: the
 * headline IS the Frequency DimensionResult, never a blend with
 * Position/Source-citation. This file is the property test that proves
 * it, plus the exact Omega-shaped fixture and the two insufficient-data
 * boundary cases the hotfix spec calls out by name.
 */
import { describe, expect, it } from "vitest";
import {
  type DimensionResult,
  MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE,
  resolveDimension,
  resolveHeadline,
  resolvePosition,
} from "@/lib/scoring/dimension-result";
import { wilsonCI } from "@/lib/scoring/wilson";

function scoredValue(d: DimensionResult): number {
  if (d.status !== "scored") throw new Error(`expected scored, got ${d.status}`);
  return d.value;
}

describe("the headline never blends in Position/Source-citation (property test)", () => {
  it("adding a mention never lowers the headline, removing one never raises it, for any sample size at or above the headline's own minimum", () => {
    // Below MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE, EVERY mention count is
    // insufficient_data regardless of value -- that's its own dedicated
    // boundary test below, not a case monotonicity-in-value applies to.
    for (let sampleCount = MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE; sampleCount <= 50; sampleCount++) {
      let prevValue = -1;
      for (let mentionedCount = 0; mentionedCount <= sampleCount; mentionedCount++) {
        const value = (mentionedCount / sampleCount) * 100;
        const headline = resolveHeadline(value, wilsonCI(mentionedCount, sampleCount), sampleCount);
        expect(headline.status).toBe("scored");
        const v = scoredValue(headline);
        expect(v).toBeGreaterThanOrEqual(prevValue);
        prevValue = v;
      }
    }
  });

  it("the headline is completely insensitive to Position/Source-citation -- varying them never changes it for the same mention rate", () => {
    const shapes: Array<[mentioned: number, sample: number]> = [
      [6, 37],
      [1, 37],
      [3, 12],
      [8, 10],
      [0, 10],
    ];
    for (const [mentioned, sample] of shapes) {
      const value = (mentioned / sample) * 100;
      const ci = wilsonCI(mentioned, sample);
      // Position/Source-citation scores that would have pulled the OLD
      // blend in wildly different directions -- the headline must not
      // move at all, because it no longer reads them.
      const unrelatedPositionOrAccuracyScores = [0, 25, 50, 75, 100];
      const headlines = unrelatedPositionOrAccuracyScores.map(() =>
        resolveHeadline(value, ci, sample),
      );
      for (const h of headlines) expect(h).toEqual(headlines[0]);
    }
  });

  // The exact live case from production audit #30's report: a brand
  // mentioned once, ranked first and cited, must score BELOW a brand
  // mentioned 6 times out of the same 37 -- reversing the old
  // composite's non-monotonic bug (where 1-of-37 scored ~62, HIGHER
  // than 6-of-37's 56.6).
  it("1 of 37 (ranked first, cited) scores below 6 of 37 -- reversing the old composite's non-monotonic bug", () => {
    const oneOf37 = resolveHeadline((1 / 37) * 100, wilsonCI(1, 37), 37);
    const sixOf37 = resolveHeadline((6 / 37) * 100, wilsonCI(6, 37), 37);
    expect(scoredValue(oneOf37)).toBeLessThan(scoredValue(sixOf37));
  });
});

describe("Omega-shaped fixture: 6 of 37 mentions, 4 answers failed (excluded)", () => {
  // The 4 failed answers are never part of sampleCount at all (lib/
  // audit/run-audit-inline.ts/run-audit.ts never write a citations row
  // for a failed call -- see db/prod-fixes/diag-0081's own finding) --
  // this fixture's sampleCount is the 37 successful answers only.
  const sampleCount = 37;
  const mentionedCount = 6;

  it("headline is 16.2, scored, with a Wilson CI of about 8-31", () => {
    const value = (mentionedCount / sampleCount) * 100;
    const ci = wilsonCI(mentionedCount, sampleCount);
    const headline = resolveHeadline(value, ci, sampleCount);
    expect(headline.status).toBe("scored");
    expect(scoredValue(headline)).toBeCloseTo(16.2, 1);
    expect(ci.lower).toBeCloseTo(8, 0);
    expect(ci.upper).toBeCloseTo(31, 0);
  });

  // All 6 of Omega's mentions were ranked (the corrected mock -- see
  // db/prod-fixes/diag-0082 excerpts: ChatGPT 4th/8th, Perplexity
  // 1st/2nd/~3rd/~8th -- every one sat inside a list).
  it("Position and Source citation are scored with n = 6 (the mention count), not n = 37", () => {
    const position = resolvePosition(71.0, wilsonCI(6, mentionedCount), mentionedCount, mentionedCount);
    const accuracy = resolveDimension(100.0, wilsonCI(6, mentionedCount), mentionedCount);
    expect(position.status).toBe("scored");
    expect(accuracy.status).toBe("scored");
  });

  it("no composite appears anywhere in the resolved shape -- only headline, frequency, position, accuracy, sampleCount, mentionedCount", async () => {
    const mod = await import("@/lib/scoring/resolve-audit-dimensions");
    expect(mod).not.toHaveProperty("resolveComposite");
    expect(mod).not.toHaveProperty("resolveAuditDimensionsAndComposite");
    const dimMod = await import("@/lib/scoring/dimension-result");
    expect(dimMod).not.toHaveProperty("resolveComposite");
    expect(dimMod).not.toHaveProperty("CompositeResult");
  });
});

describe("boundary states the hotfix spec names explicitly", () => {
  it("a 0-mention audit (with real answers) gives headline 0, scored -- Position/Source citation are insufficient_data (no_mentions)", () => {
    const sampleCount = 20;
    const headline = resolveHeadline(0, wilsonCI(0, sampleCount), sampleCount);
    expect(headline).toEqual({ status: "scored", value: 0, ci: { lower: 0, upper: expect.any(Number) } });

    const position = resolvePosition(0, { lower: 0, upper: 0 }, 0, 0);
    const accuracy = resolveDimension(0, { lower: 0, upper: 0 }, 0);
    expect(position).toEqual({ status: "insufficient_data", reason: "no_mentions" });
    expect(accuracy).toEqual({ status: "insufficient_data", reason: "no_mentions" });
  });

  it("insufficient answers (zero successful organic answers at all) give the headline state insufficient_data, reason no_answers", () => {
    const headline = resolveHeadline(0, wilsonCI(0, 0), 0);
    expect(headline).toEqual({ status: "insufficient_data", reason: "no_answers" });
  });

  // Vunnara (20 Oct, post-a093ceb), item 2: raised from 1 to 10 -- a
  // single answer could only ever show 0% or 100%. Tests exactly 9 and
  // 10, the named constant's own boundary.
  it("9 successful answers: insufficient_data, reason no_answers (one short of the minimum)", () => {
    const headline = resolveHeadline(0, wilsonCI(0, 9), 9);
    expect(headline).toEqual({ status: "insufficient_data", reason: "no_answers" });
  });

  it("10 successful answers: scored (exactly the minimum)", () => {
    expect(MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE).toBe(10);
    const headline = resolveHeadline(0, wilsonCI(0, 10), 10);
    expect(headline.status).toBe("scored");
  });

  // Vunnara (20 Oct, post-a093ceb), item 1: a real mention that sits in
  // plain prose (no list marker on its line) has no rank to show --
  // resolvePosition's third state, distinct from "insufficient_data"
  // (which would wrongly imply zero mentions).
  it("mentioned, but never inside a list (rankedCount 0 of mentionedCount > 0): not_measured, reason not_ranked", () => {
    const position = resolvePosition(0, { lower: 0, upper: 0 }, 5, 0);
    expect(position).toEqual({ status: "not_measured", reason: "not_ranked" });
  });

  it("mentioned, some ranked some not: scored, from the ranked subset only", () => {
    const position = resolvePosition(80, wilsonCI(2, 3), 5, 3);
    expect(position.status).toBe("scored");
  });
});
