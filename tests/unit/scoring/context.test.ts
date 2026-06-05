import { describe, expect, it } from "vitest";
import { contextDimensionScore } from "@/lib/scoring/context";

describe("contextDimensionScore", () => {
  it("all recommended = 100", () =>
    expect(contextDimensionScore(["recommended", "recommended"])).toBe(100));
  it("all commodified = 25 (NOT 0)", () =>
    expect(contextDimensionScore(["commodified", "commodified"])).toBe(25));
  it("mixed recommended + listed = 75", () =>
    expect(contextDimensionScore(["recommended", "listed"])).toBe(75));
  it("empty = 0", () => expect(contextDimensionScore([])).toBe(0));
});
