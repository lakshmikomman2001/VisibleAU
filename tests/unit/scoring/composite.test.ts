import { describe, expect, it } from "vitest";
import { compositeVisibilityScore } from "@/lib/scoring/composite";
import { sentimentDimensionScore } from "@/lib/scoring/sentiment";
import { contextDimensionScore } from "@/lib/scoring/context";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";

describe("compositeVisibilityScore", () => {
  it("all 100s = 100", () => {
    expect(
      compositeVisibilityScore({
        frequency: 100,
        position: 100,
        sentiment: 100,
        context: 100,
        accuracy: 100,
      }),
    ).toBe(100);
  });
  it("all 0s = 0", () => {
    expect(
      compositeVisibilityScore({
        frequency: 0,
        position: 0,
        sentiment: 0,
        context: 0,
        accuracy: 0,
      }),
    ).toBe(0);
  });
  it("weighted correctly: freq=100, rest=0", () => {
    const score = compositeVisibilityScore({
      frequency: 100,
      position: 0,
      sentiment: 0,
      context: 0,
      accuracy: 0,
    });
    expect(score).toBeCloseTo(25, 1);
  });

  it("0%-mention brand scores exactly 0.00 (not 13.75)", () => {
    const freq = frequencyDimensionScore(0, 192);
    const pos = positionDimensionScore([]);
    const sent = sentimentDimensionScore([]);
    const ctx = contextDimensionScore([]);
    const acc = accuracyDimensionScore([]);
    const composite = compositeVisibilityScore({
      frequency: freq,
      position: pos,
      sentiment: sent,
      context: ctx,
      accuracy: acc,
    });
    expect(freq).toBe(0);
    expect(pos).toBe(0);
    expect(sent).toBe(0);
    expect(ctx).toBe(0);
    expect(acc).toBe(0);
    expect(composite).toBe(0);
  });

  it("commodified mention still scores 25 (Round 29 canon)", () => {
    expect(contextDimensionScore(["commodified"])).toBe(25);
    expect(contextDimensionScore(["commodified", "commodified"])).toBe(25);
  });
});
