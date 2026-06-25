import { afterEach, describe, expect, it } from "vitest";
import { PROMPTS_PER_AUDIT, RUNS_MAX, RUNS_MIN, runsForTier, TIER_RUNS_PER_PROMPT } from "@/lib/llm/tier-engines";

describe("runsForTier", () => {
  afterEach(() => {
    delete process.env.TIER_RUNS_FREE;
    delete process.env.TIER_RUNS_STARTER;
    delete process.env.TIER_RUNS_GROWTH;
    delete process.env.TIER_RUNS_AGENCY;
    delete process.env.TIER_RUNS_AGENCY_PRO;
    delete process.env.TIER_RUNS_ENTERPRISE;
  });

  it("returns 5 for every known tier by default", () => {
    for (const tier of Object.keys(TIER_RUNS_PER_PROMPT)) {
      expect(runsForTier(tier)).toBe(5);
    }
  });

  it("returns 5 for null/undefined tier", () => {
    expect(runsForTier(null)).toBe(5);
    expect(runsForTier(undefined)).toBe(5);
  });

  it("returns 5 for unknown tier string", () => {
    expect(runsForTier("bogus")).toBe(5);
  });

  it("respects env override", () => {
    process.env.TIER_RUNS_FREE = "3";
    expect(runsForTier("free")).toBe(3);
  });

  it("clamps env override below RUNS_MIN to 1", () => {
    process.env.TIER_RUNS_FREE = "0";
    expect(runsForTier("free")).toBe(RUNS_MIN);
  });

  it("clamps env override above RUNS_MAX to 5", () => {
    process.env.TIER_RUNS_FREE = "99";
    expect(runsForTier("free")).toBe(RUNS_MAX);
  });

  it("rounds fractional env value", () => {
    process.env.TIER_RUNS_STARTER = "2.7";
    expect(runsForTier("starter")).toBe(3);
  });

  it("ignores non-numeric env value", () => {
    process.env.TIER_RUNS_FREE = "abc";
    expect(runsForTier("free")).toBe(5);
  });

  it("ignores empty string env value", () => {
    process.env.TIER_RUNS_FREE = "";
    expect(runsForTier("free")).toBe(5);
  });

  it("normalises tier with spaces and mixed case", () => {
    expect(runsForTier("Agency Pro")).toBe(5);
    expect(runsForTier("FREE")).toBe(5);
  });
});

describe("constants", () => {
  it("RUNS_MIN is 1", () => expect(RUNS_MIN).toBe(1));
  it("RUNS_MAX is 5", () => expect(RUNS_MAX).toBe(5));
  it("PROMPTS_PER_AUDIT is 10", () => expect(PROMPTS_PER_AUDIT).toBe(10));
});
