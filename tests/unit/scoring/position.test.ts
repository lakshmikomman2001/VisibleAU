import { describe, expect, it } from "vitest";
import { positionDimensionScore } from "@/lib/scoring/position";

describe("positionDimensionScore", () => {
  it("position 1 = 100 (mentioned first)", () => expect(positionDimensionScore([1])).toBe(100));
  it("position 11 = 50", () => expect(positionDimensionScore([11])).toBe(50));
  it("position 21+ = 0 (buried)", () => expect(positionDimensionScore([21])).toBe(0));
  it("null positions ignored", () => expect(positionDimensionScore([null, null])).toBe(0));
  it("mixed: [1, 11] averages to 75", () => expect(positionDimensionScore([1, 11])).toBe(75));
});
