import { describe, expect, it } from "vitest";
import { wilsonCI } from "@/lib/scoring/wilson";

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
