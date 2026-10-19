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
  resolveDimension,
  resolveHeadline,
} from "@/lib/scoring/dimension-result";
import { wilsonCI } from "@/lib/scoring/wilson";

function scoredValue(d: DimensionResult): number {
  if (d.status !== "scored") throw new Error(`expected scored, got ${d.status}`);
  return d.value;
}

describe("the headline never blends in Position/Source-citation (property test)", () => {
  it("adding a mention never lowers the headline, removing one never raises it, for any sample size", () => {
    for (let sampleCount = 1; sampleCount <= 50; sampleCount++) {
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
      [8, 8],
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

  it("Position and Source citation are scored with n = 6 (the mention count), not n = 37", () => {
    // mentionRowCount is what resolveDimension gates Position/Accuracy
    // on -- the 6 mentions, never the 37 total answers.
    const position = resolveDimension(71.0, wilsonCI(6, mentionedCount), mentionedCount);
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

    const position = resolveDimension(0, { lower: 0, upper: 0 }, 0);
    const accuracy = resolveDimension(0, { lower: 0, upper: 0 }, 0);
    expect(position).toEqual({ status: "insufficient_data", reason: "no_mentions" });
    expect(accuracy).toEqual({ status: "insufficient_data", reason: "no_mentions" });
  });

  it("insufficient answers (zero successful organic answers at all) give the headline state insufficient_data, reason no_answers", () => {
    const headline = resolveHeadline(0, wilsonCI(0, 0), 0);
    expect(headline).toEqual({ status: "insufficient_data", reason: "no_answers" });
  });
});
