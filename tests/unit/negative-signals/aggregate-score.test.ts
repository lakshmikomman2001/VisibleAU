import { describe, expect, it } from "vitest";
import { aggregateNegativeScore } from "@/lib/negative-signals/detect";

function sig(severity: "critical" | "warning" | "info", pattern = "test") {
  return { pattern, severity, count: 1, detail: "test" };
}

describe("aggregateNegativeScore", () => {
  it("returns 6 for clean input (no signals)", () => {
    expect(aggregateNegativeScore([])).toBe(6);
  });

  it("returns near 0 for all-critical input", () => {
    const signals = [sig("critical"), sig("critical"), sig("critical")];
    const score = aggregateNegativeScore(signals);
    expect(score).toBe(0);
  });

  it("penalizes criticals by 2 and warnings by 1", () => {
    expect(aggregateNegativeScore([sig("critical")])).toBe(4);
    expect(aggregateNegativeScore([sig("warning")])).toBe(5);
    expect(aggregateNegativeScore([sig("critical"), sig("warning")])).toBe(3);
  });

  it("does not penalize info signals", () => {
    expect(aggregateNegativeScore([sig("info")])).toBe(6);
    expect(aggregateNegativeScore([sig("info"), sig("info"), sig("info")])).toBe(6);
  });

  it("always returns a value in [0, 6]", () => {
    const heavy = Array.from({ length: 20 }, () => sig("critical"));
    const score = aggregateNegativeScore(heavy);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(6);
  });
});
