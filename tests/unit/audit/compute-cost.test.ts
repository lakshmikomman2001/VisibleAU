import { describe, expect, it } from "vitest";
import { computeCostUsd } from "@/lib/audit/compute-cost";

describe("computeCostUsd", () => {
  it("gpt-4o-mini: 1000 input + 1000 output tokens", () => {
    const cost = computeCostUsd("gpt-4o-mini", 1000, 1000);
    expect(cost).toBeCloseTo(0.00015 + 0.0006, 6);
  });
  it("unknown model returns 0", () => {
    expect(computeCostUsd("unknown-model", 1000, 1000)).toBe(0);
  });
  it("zero tokens = zero cost", () => {
    expect(computeCostUsd("gpt-4o-mini", 0, 0)).toBe(0);
  });
});
