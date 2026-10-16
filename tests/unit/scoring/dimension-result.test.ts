import { describe, expect, it } from "vitest";
import {
  type DimensionKey,
  type DimensionResult,
  resolveComposite,
  resolveDimension,
} from "@/lib/scoring/dimension-result";

const CI0 = { lower: 0, upper: 0 };

describe("resolveDimension", () => {
  it("0 mention rows: insufficient_data, reason no_mentions", () => {
    const result = resolveDimension(0, CI0, 0);
    expect(result).toEqual({ status: "insufficient_data", reason: "no_mentions" });
  });

  it("some mention rows: scored, with the given value and CI", () => {
    const ci = { lower: 10, upper: 30 };
    const result = resolveDimension(20, ci, 5);
    expect(result).toEqual({ status: "scored", value: 20, ci });
  });

  it("alwaysScored: true keeps a dimension scored even at 0 mention rows (Frequency's rule)", () => {
    const result = resolveDimension(0, { lower: 0, upper: 15 }, 0, { alwaysScored: true });
    expect(result).toEqual({ status: "scored", value: 0, ci: { lower: 0, upper: 15 } });
  });

  it("alwaysScored does not change behaviour when there ARE mentions", () => {
    const ci = { lower: 40, upper: 60 };
    const result = resolveDimension(50, ci, 10, { alwaysScored: true });
    expect(result).toEqual({ status: "scored", value: 50, ci });
  });
});

describe("resolveComposite", () => {
  const scored = (value: number, ci = CI0): DimensionResult => ({ status: "scored", value, ci });
  const insufficient = (): DimensionResult => ({ status: "insufficient_data", reason: "no_mentions" });

  it("0 mentions: basis frequency_only, composite equals Frequency's own value and CI", () => {
    const freqCi = { lower: 0, upper: 16 };
    const result = resolveComposite({
      frequency: scored(0, freqCi),
      position: insufficient(),
      sentiment: insufficient(),
      context: insufficient(),
      accuracy: insufficient(),
    });
    expect(result.basis).toBe("frequency_only");
    expect(result.value).toBe(0);
    expect(result.ci).toEqual(freqCi);
    expect(result.weightsUsed).toEqual({ frequency: 1 });
  });

  it("all 5 scored: basis weighted, matches compositeVisibilityScore's own weighting (original weights, no renormalisation needed)", () => {
    const result = resolveComposite({
      frequency: scored(100, { lower: 90, upper: 100 }),
      position: scored(100, { lower: 90, upper: 100 }),
      sentiment: scored(100, { lower: 90, upper: 100 }),
      context: scored(100, { lower: 90, upper: 100 }),
      accuracy: scored(100, { lower: 90, upper: 100 }),
    });
    expect(result.basis).toBe("weighted");
    expect(result.value).toBeCloseTo(100, 5);
    expect(result.weightsUsed).toEqual({
      frequency: 0.25,
      position: 0.25,
      sentiment: 0.2,
      context: 0.15,
      accuracy: 0.15,
    });
  });

  it("partial: some dimensions insufficient_data -- weights renormalise over the scored subset only", () => {
    // Only frequency (0.25) and position (0.25) scored -- renormalised
    // weight for each should be 0.25 / 0.5 = 0.5.
    const result = resolveComposite({
      frequency: scored(80, { lower: 70, upper: 90 }),
      position: scored(60, { lower: 50, upper: 70 }),
      sentiment: insufficient(),
      context: insufficient(),
      accuracy: insufficient(),
    });
    expect(result.basis).toBe("weighted");
    expect(result.weightsUsed.frequency).toBeCloseTo(0.5, 5);
    expect(result.weightsUsed.position).toBeCloseTo(0.5, 5);
    expect(result.weightsUsed.sentiment).toBeUndefined();
    expect(result.value).toBeCloseTo(80 * 0.5 + 60 * 0.5, 5);
    expect(result.ci.lower).toBeCloseTo(70 * 0.5 + 50 * 0.5, 5);
    expect(result.ci.upper).toBeCloseTo(90 * 0.5 + 70 * 0.5, 5);
  });

  it("the composite is never itself insufficient_data -- Frequency alone is always enough to anchor it", () => {
    const result = resolveComposite({
      frequency: scored(0, CI0),
      position: insufficient(),
      sentiment: insufficient(),
      context: insufficient(),
      accuracy: insufficient(),
    });
    expect(result).not.toHaveProperty("reason");
    expect(typeof result.value).toBe("number");
  });

  it("every DimensionKey is covered by the default weights (compiler/runtime exhaustiveness)", () => {
    const keys: DimensionKey[] = ["frequency", "position", "sentiment", "context", "accuracy"];
    const result = resolveComposite(
      Object.fromEntries(keys.map((k) => [k, scored(50, { lower: 40, upper: 60 })])) as Record<
        DimensionKey,
        DimensionResult
      >,
    );
    expect(result.value).toBeCloseTo(50, 5);
  });
});
