import { describe, expect, it } from "vitest";
import { PROMPTS_PER_AUDIT, RUNS_MAX, RUNS_MIN, RUNS_PER_PROMPT, runsForTier } from "@/lib/llm/tier-engines";

/**
 * Vunnara Build 1, Part F.1: the per-tier TIER_RUNS_PER_PROMPT table
 * and its TIER_RUNS_<TIER> env override are gone entirely -- the LLM
 * cache key is sha256(prompt + model) with no run index, so every run
 * after the first replayed run 1's exact cached response, never an
 * independent sample. runsForTier now always returns the single
 * RUNS_PER_PROMPT constant (1), regardless of tier or environment.
 */
describe("runsForTier", () => {
  it("always returns RUNS_PER_PROMPT (1) for every known tier", () => {
    for (const tier of ["free", "starter", "growth", "agency", "agency_pro", "enterprise"]) {
      expect(runsForTier(tier)).toBe(RUNS_PER_PROMPT);
      expect(runsForTier(tier)).toBe(1);
    }
  });

  it("returns 1 for null/undefined tier", () => {
    expect(runsForTier(null)).toBe(1);
    expect(runsForTier(undefined)).toBe(1);
  });

  it("returns 1 for an unknown tier string -- no per-tier branching left at all", () => {
    expect(runsForTier("bogus")).toBe(1);
  });

  it("is not affected by a TIER_RUNS_* environment variable -- that override mechanism is gone", () => {
    process.env.TIER_RUNS_FREE = "5";
    try {
      expect(runsForTier("free")).toBe(1);
    } finally {
      delete process.env.TIER_RUNS_FREE;
    }
  });
});

describe("constants", () => {
  it("RUNS_PER_PROMPT is 1 -- the single source of truth for runs-per-question", () => {
    expect(RUNS_PER_PROMPT).toBe(1);
  });

  it("RUNS_MIN is 1", () => expect(RUNS_MIN).toBe(1));

  it("RUNS_MAX is still 5 -- kept only as the historical ceiling app/api/brands/[brandId]/evidence/route.ts over-fetches against for pre-Part-F audits, not a bound on new ones", () => {
    expect(RUNS_MAX).toBe(5);
  });

  it("PROMPTS_PER_AUDIT is 10", () => expect(PROMPTS_PER_AUDIT).toBe(10));
});
