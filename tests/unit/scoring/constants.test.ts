import { describe, expect, it } from "vitest";
import { CONTEXT_SCORE_MAP, DIMENSION_WEIGHTS, SENTIMENT_SCORE_MAP } from "@/lib/scoring/constants";

describe("DIMENSION_WEIGHTS", () => {
  it("sum to 1.0", () => {
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
  it("frequency=0.25, position=0.25, sentiment=0.20, context=0.15, accuracy=0.15", () => {
    expect(DIMENSION_WEIGHTS.frequency).toBe(0.25);
    expect(DIMENSION_WEIGHTS.position).toBe(0.25);
    expect(DIMENSION_WEIGHTS.sentiment).toBe(0.2);
    expect(DIMENSION_WEIGHTS.context).toBe(0.15);
    expect(DIMENSION_WEIGHTS.accuracy).toBe(0.15);
  });
});

describe("CONTEXT_SCORE_MAP", () => {
  it("commodified = 25 (NOT 0 — Round 29 fix)", () => {
    expect(CONTEXT_SCORE_MAP.commodified).toBe(25);
  });
  it("recommended=100, listed=50, mentioned=25", () => {
    expect(CONTEXT_SCORE_MAP.recommended).toBe(100);
    expect(CONTEXT_SCORE_MAP.listed).toBe(50);
    expect(CONTEXT_SCORE_MAP.mentioned).toBe(25);
  });
});

describe("SENTIMENT_SCORE_MAP", () => {
  it("positive=100, neutral=50, negative=0", () => {
    expect(SENTIMENT_SCORE_MAP.positive).toBe(100);
    expect(SENTIMENT_SCORE_MAP.neutral).toBe(50);
    expect(SENTIMENT_SCORE_MAP.negative).toBe(0);
  });
});
