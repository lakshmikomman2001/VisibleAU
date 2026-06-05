import { describe, expect, it } from "vitest";
import { compositeVisibilityScore } from "@/lib/scoring/composite";

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
});
