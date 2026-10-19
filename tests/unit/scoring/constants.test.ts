import { describe, expect, it } from "vitest";
import { CONTEXT_SCORE_MAP, SENTIMENT_SCORE_MAP } from "@/lib/scoring/constants";

// Vunnara (19 Oct, post-aa83b3a): DIMENSION_WEIGHTS was deleted along
// with the weighted composite it only ever existed for ("the headline
// is the mention rate") -- its dedicated describe block went with it.

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
