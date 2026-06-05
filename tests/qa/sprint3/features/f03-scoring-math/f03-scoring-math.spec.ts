import path from "node:path";
import { expect, test } from "@playwright/test";

function loadModule(relativePath: string) {
  return require(path.join(process.cwd(), relativePath));
}

test.describe("F03: Scoring Math (Sprint 3)", () => {
  test("F03-01: DIMENSION_WEIGHTS sum to 1.0", async () => {
    const { DIMENSION_WEIGHTS } = loadModule("lib/scoring/constants");
    const sum = Object.values(DIMENSION_WEIGHTS).reduce(
      (a: number, b: unknown) => a + (b as number),
      0,
    );
    expect(sum).toBeCloseTo(1.0, 10);
  });

  test("F03-02: Commodified context score is 25 (NOT 0)", async () => {
    const { CONTEXT_SCORE_MAP } = loadModule("lib/scoring/constants");
    expect(CONTEXT_SCORE_MAP.commodified).toBe(25);
  });

  test("F03-03: Composite score with all 100s = 100", async () => {
    const { compositeVisibilityScore } = loadModule("lib/scoring/composite");
    const score = compositeVisibilityScore({
      frequency: 100,
      position: 100,
      sentiment: 100,
      context: 100,
      accuracy: 100,
    });
    expect(score).toBe(100);
  });

  test("F03-04: Wilson CI returns valid bounds", async () => {
    const { wilsonCI } = loadModule("lib/scoring/wilson");
    const ci = wilsonCI(3, 5);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.upper).toBeLessThanOrEqual(100);
    expect(ci.lower).toBeLessThanOrEqual(ci.upper);
  });

  test("F03-05: Frequency score: 50% mentions = 50", async () => {
    const { frequencyDimensionScore } = loadModule("lib/scoring/frequency");
    expect(frequencyDimensionScore(100, 200)).toBe(50);
  });

  test("F03-06: Position score: position 1 = 100", async () => {
    const { positionDimensionScore } = loadModule("lib/scoring/position");
    expect(positionDimensionScore([1])).toBe(100);
  });
});
