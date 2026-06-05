import { describe, expect, it } from "vitest";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";

describe("frequencyDimensionScore", () => {
  it("100% mention rate = 100", () => expect(frequencyDimensionScore(200, 200)).toBe(100));
  it("50% mention rate = 50", () => expect(frequencyDimensionScore(100, 200)).toBe(50));
  it("0 mentions = 0", () => expect(frequencyDimensionScore(0, 200)).toBe(0));
  it("0 total calls = 0 (no division by zero)", () =>
    expect(frequencyDimensionScore(0, 0)).toBe(0));
});
