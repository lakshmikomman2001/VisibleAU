import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  setRlsContext: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  audits: { id: "id", brandId: "brand_id", organizationId: "organization_id", status: "status" },
  brands: { id: "id" },
  citations: { auditId: "audit_id" },
  organizations: { id: "id", tier: "tier", slug: "slug" },
  actionItems: {},
  driftAlerts: {},
  verticalPackPrompts: {},
  verticalPacks: {},
}));

vi.mock("@/db/schema/subscriptions", () => ({
  subscriptions: { organizationId: "organization_id", tier: "tier" },
}));

vi.mock("@/db/schema/enums", () => ({
  tierEnum: { enumValues: ["free", "starter", "growth"] },
}));

import {
  enginesForTier,
  PROMPTS_PER_AUDIT,
  runsForTier,
  TIER_ENGINES,
} from "@/lib/llm/tier-engines";

describe("Phase 1 unchanged regression", () => {
  it("TIER_ENGINES still governs engine counts (not hardcoded)", () => {
    expect(TIER_ENGINES.free).toHaveLength(2);
    expect(TIER_ENGINES.starter).toHaveLength(4);
    expect(TIER_ENGINES.growth).toHaveLength(4);
  });

  it("enginesForTier returns correct engines for each tier", () => {
    expect(enginesForTier("free")).toEqual(["chatgpt", "perplexity"]);
    expect(enginesForTier("growth")).toEqual(["chatgpt", "claude", "gemini", "perplexity"]);
  });

  // Vunnara Build 1, Part F.1: this WAS a Phase 1 invariant (runsPerPrompt
  // = 5 for every tier) -- deliberately changed, not a regression. The
  // replay loop this fed is gone: the LLM cache key has no run index,
  // so runs 2-5 only ever replayed run 1's cached response, inflating
  // totalCalls/citations rows/budget estimates 5x for zero additional
  // measurement. runsForTier now always returns 1.
  it("runsPerPrompt is now 1 for all tiers (Vunnara Build 1, Part F.1 -- the replay loop is gone)", () => {
    expect(runsForTier("free")).toBe(1);
    expect(runsForTier("starter")).toBe(1);
    expect(runsForTier("growth")).toBe(1);
    expect(runsForTier("agency")).toBe(1);
  });

  it("PROMPTS_PER_AUDIT is 10", () => {
    expect(PROMPTS_PER_AUDIT).toBe(10);
  });

  it("scoring functions produce deterministic results", async () => {
    const { frequencyDimensionScore } = await import("@/lib/scoring/frequency");
    const { positionDimensionScore } = await import("@/lib/scoring/position");
    const { accuracyDimensionScore } = await import("@/lib/scoring/accuracy");

    const freq = frequencyDimensionScore(50, 100);
    expect(freq).toBe(50);

    const pos = positionDimensionScore([1, 2, 3]);
    expect(typeof pos).toBe("number");
    expect(pos).toBeGreaterThan(0);

    const acc = accuracyDimensionScore([
      { brandMentioned: true, mentionVerification: null, citedSources: ["https://example.com"] },
      { brandMentioned: false, mentionVerification: null, citedSources: [] },
    ]);
    expect(typeof acc).toBe("number");
  });
});
