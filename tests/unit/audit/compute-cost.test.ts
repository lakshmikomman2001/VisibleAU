import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addCost,
  callCost,
  computeCostUsd,
  EMPTY_COST_TALLY,
  unpricedReserve,
} from "@/lib/audit/compute-cost";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("computeCostUsd", () => {
  it("gpt-4o-mini: 1000 input + 1000 output tokens", () => {
    const cost = computeCostUsd("gpt-4o-mini", 1000, 1000);
    expect(cost).toBeCloseTo(0.00015 + 0.0006, 6);
  });

  it("an unpriced model is unknown (null) -- never 0 -- and logs cost_price_missing with its model id", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(computeCostUsd("unknown-model", 1000, 1000)).toBeNull();
    expect(error).toHaveBeenCalledWith(
      "[cost_price_missing]",
      JSON.stringify({ event: "cost_price_missing", model: "unknown-model" }),
    );
  });

  it("zero tokens = zero cost", () => {
    expect(computeCostUsd("gpt-4o-mini", 0, 0)).toBe(0);
  });
});

describe("callCost", () => {
  it("a priced call is its tokens plus the fee, with no reserve", () => {
    const cost = callCost("chatgpt", "gpt-4.1-mini", 1000, 1000, 0.01);
    expect(cost.usd).toBeCloseTo(0.0004 + 0.0016 + 0.01, 6);
    expect(cost.capReserveUsd).toBe(0);
  });

  it("an unpriced call has no cost, and a cap-only reserve at the engine's highest listed rates plus the fee", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cost = callCost("claude", "claude-not-in-the-table", 1000, 1000, 0.01);
    expect(cost.usd).toBeNull();
    // Claude's highest listed rates per 1K tokens: 0.003 input, 0.015 output.
    expect(cost.capReserveUsd).toBeCloseTo(0.003 + 0.015 + 0.01, 6);
  });
});

describe("addCost / unpricedReserve", () => {
  it("sums the priced part, flags anything unpriced, and only then hands back a reserve", () => {
    const priced = addCost(addCost(EMPTY_COST_TALLY, 0.25), 0.25);
    expect(priced).toEqual({ knownUsd: 0.5, unpriced: false, capReserveUsd: 0 });
    expect(unpricedReserve(priced)).toBeUndefined();

    const withUnpriced = addCost(priced, null, 0.4);
    expect(withUnpriced).toEqual({ knownUsd: 0.5, unpriced: true, capReserveUsd: 0.4 });
    expect(unpricedReserve(withUnpriced)).toBe(0.4);
  });
});
