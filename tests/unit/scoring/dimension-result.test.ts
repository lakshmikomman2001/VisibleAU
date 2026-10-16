import { describe, expect, it } from "vitest";
import {
  type DimensionKey,
  type DimensionResult,
  NOT_MEASURED_DIMENSION,
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

  // Task #46 Phase 3, Part C: Sentiment and Context are permanently
  // NOT_MEASURED_DIMENSION in production (no real classifier exists), which
  // is a THIRD status distinct from both "scored" and "insufficient_data".
  // resolveComposite needed zero code changes to handle it -- it already
  // filters generically on `status === "scored"` -- these tests pin that
  // down explicitly for the one combination that matters: Frequency,
  // Position and Source citation scored, Sentiment and Context not_measured.
  it("not_measured dimensions are excluded, same as insufficient_data -- weights renormalise over Frequency/Position/Accuracy only", () => {
    const result = resolveComposite({
      frequency: scored(80, { lower: 70, upper: 90 }),
      position: scored(60, { lower: 50, upper: 70 }),
      sentiment: NOT_MEASURED_DIMENSION,
      context: NOT_MEASURED_DIMENSION,
      accuracy: scored(40, { lower: 30, upper: 50 }),
    });
    expect(result.basis).toBe("weighted");
    // Original weights 0.25 / 0.25 / 0.15 sum to 0.65 -- renormalised:
    // 0.25/0.65, 0.25/0.65, 0.15/0.65 = 5/13, 5/13, 3/13 ≈ 38.46%/38.46%/23.08%.
    expect(result.weightsUsed.frequency).toBeCloseTo(5 / 13, 5);
    expect(result.weightsUsed.position).toBeCloseTo(5 / 13, 5);
    expect(result.weightsUsed.accuracy).toBeCloseTo(3 / 13, 5);
    expect(result.weightsUsed.sentiment).toBeUndefined();
    expect(result.weightsUsed.context).toBeUndefined();
    expect(result.value).toBeCloseTo(80 * (5 / 13) + 60 * (5 / 13) + 40 * (3 / 13), 5);
  });

  // RED under the pre-Phase-3 code path (which scored Sentiment/Context from
  // mention.found alone), GREEN under the current one: a brand mentioned in
  // every response used to score 100 on Sentiment ("positive") and 50 on
  // Context ("listed") purely because it was mentioned -- not because any
  // classifier measured tone or framing -- inflating the composite by their
  // combined 35% weight. With both permanently not_measured, that boost is
  // gone and the composite reflects only real measurements.
  it("a mentioned brand no longer gets a fabricated Sentiment/Context boost", () => {
    const real = {
      frequency: scored(60, { lower: 50, upper: 70 }),
      position: scored(60, { lower: 50, upper: 70 }),
      accuracy: scored(60, { lower: 50, upper: 70 }),
    };

    // Pre-Phase-3 behaviour: every mention row fabricates sentiment="positive"
    // (100) and context="listed" (50) purely from mention.found, with no real
    // classifier behind either value.
    const fabricated = resolveComposite({
      ...real,
      sentiment: scored(100, { lower: 100, upper: 100 }),
      context: scored(50, { lower: 50, upper: 50 }),
    });

    // Current behaviour: both permanently not_measured, excluded from the blend.
    const honest = resolveComposite({
      ...real,
      sentiment: NOT_MEASURED_DIMENSION,
      context: NOT_MEASURED_DIMENSION,
    });

    expect(honest.weightsUsed).not.toHaveProperty("sentiment");
    expect(honest.weightsUsed).not.toHaveProperty("context");
    // Frequency/Position/Accuracy are all 60, so the honest composite is
    // exactly 60 -- the fabricated one is pulled up by the hardcoded
    // 100/50 sentiment/context values mixed in at their 20%/15% weight.
    expect(honest.value).toBeCloseTo(60, 5);
    expect(fabricated.value).toBeGreaterThan(honest.value);
  });
});
