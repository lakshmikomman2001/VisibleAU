import { describe, it, expect } from "vitest";
import { computeConsistencyScore } from "@/lib/trust/consensus-checker";

const BASE_INPUT = {
  sourceType: "reddit_thread",
  sourceUrl: null,
  pricePositioning: "not_stated" as const,
};

describe("computeConsistencyScore — scoring formula", () => {
  it("all fields match → 100", () => {
    const result = computeConsistencyScore({
      ...BASE_INPUT,
      nameMatch: true,
      serviceMatch: true,
      locationMatch: true,
      differentiatorsMatch: true,
    });
    expect(result.consistencyScore).toBe(100);
  });

  it("no fields match → 0", () => {
    const result = computeConsistencyScore({
      ...BASE_INPUT,
      nameMatch: false,
      serviceMatch: false,
      locationMatch: false,
      differentiatorsMatch: false,
    });
    expect(result.consistencyScore).toBe(0);
  });

  it("partial matches produce proportional score", () => {
    const result = computeConsistencyScore({
      ...BASE_INPUT,
      nameMatch: true,
      serviceMatch: true,
      locationMatch: false,
      differentiatorsMatch: false,
    });
    expect(result.consistencyScore).toBe(50);
  });

  it("single match → 25", () => {
    const result = computeConsistencyScore({
      ...BASE_INPUT,
      nameMatch: true,
      serviceMatch: false,
      locationMatch: false,
      differentiatorsMatch: false,
    });
    expect(result.consistencyScore).toBe(25);
  });

  it("returns discrepancies for non-matching fields", () => {
    const result = computeConsistencyScore({
      ...BASE_INPUT,
      nameMatch: false,
      serviceMatch: true,
      locationMatch: true,
      differentiatorsMatch: true,
    });
    expect(result.discrepancies.length).toBe(1);
    expect(result.discrepancies[0].field).toBe("name");
  });
});
