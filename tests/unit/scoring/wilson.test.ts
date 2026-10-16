import { describe, expect, it } from "vitest";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";

describe("wilsonCI", () => {
  it("0 trials returns {0, 0}", () => {
    expect(wilsonCI(0, 0)).toEqual({ lower: 0, upper: 0 });
  });
  it("5/5 successes: upper close to 100", () => {
    const ci = wilsonCI(5, 5);
    expect(ci.upper).toBeGreaterThan(80);
    expect(ci.lower).toBeGreaterThan(40);
  });
  it("0/5 successes: lower = 0", () => {
    const ci = wilsonCI(0, 5);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
  });
  it("bounds are within [0, 100]", () => {
    const ci = wilsonCI(3, 5);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.upper).toBeLessThanOrEqual(100);
  });
  it("lower <= upper", () => {
    const ci = wilsonCI(2, 5);
    expect(ci.lower).toBeLessThanOrEqual(ci.upper);
  });
});

describe("wilsonCIFromScore", () => {
  it("0 sample size returns {0, 0}", () => {
    expect(wilsonCIFromScore(0, 0)).toEqual({ lower: 0, upper: 0 });
  });

  it("score = 0 at small n: non-zero-width interval, lower pinned to 0", () => {
    const ci = wilsonCIFromScore(0, 5);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
  });

  it("score = 100 at small n: non-zero-width interval, upper pinned to 100", () => {
    const ci = wilsonCIFromScore(100, 5);
    expect(ci.upper).toBe(100);
    expect(ci.lower).toBeLessThan(100);
  });

  it("score = 0 never collapses to zero width at ANY sample size (the Wald bug this replaces)", () => {
    for (const n of [1, 5, 40, 200, 10000]) {
      const ci = wilsonCIFromScore(0, n);
      expect(ci.upper, `n=${n}`).toBeGreaterThan(ci.lower);
    }
  });

  it("a moderate score's interval is centred near the score and widens at smaller n", () => {
    const small = wilsonCIFromScore(50, 10);
    const large = wilsonCIFromScore(50, 500);
    expect(small.upper - small.lower).toBeGreaterThan(large.upper - large.lower);
  });

  it("bounds are within [0, 100]", () => {
    const ci = wilsonCIFromScore(60, 7);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.upper).toBeLessThanOrEqual(100);
  });
});
