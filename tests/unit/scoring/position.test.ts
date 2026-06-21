import { describe, expect, it } from "vitest";
import { positionDimensionScore } from "@/lib/scoring/position";

describe("positionDimensionScore", () => {
  it("position 1 = 100 (mentioned first)", () => expect(positionDimensionScore([1])).toBe(100));
  it("position 11 = 80", () => expect(positionDimensionScore([11])).toBe(80));
  it("position 51 = 0 (buried)", () => expect(positionDimensionScore([51])).toBe(0));
  it("null positions ignored", () => expect(positionDimensionScore([null, null])).toBe(0));
  it("mixed: [1, 11] averages to 90 (median=6)", () => expect(positionDimensionScore([1, 11])).toBe(90));
});
