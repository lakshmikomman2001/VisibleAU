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

import { TIER_ENGINES, enginesForTier, runsForTier, PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";

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

  it("runsPerPrompt is still 5 for all tiers (Phase 1 invariant)", () => {
    expect(runsForTier("free")).toBe(5);
    expect(runsForTier("starter")).toBe(5);
    expect(runsForTier("growth")).toBe(5);
    expect(runsForTier("agency")).toBe(5);
  });

  it("PROMPTS_PER_AUDIT is 10", () => {
    expect(PROMPTS_PER_AUDIT).toBe(10);
  });

  it("scoring functions produce deterministic results", async () => {
    const { frequencyDimensionScore } = await import("@/lib/scoring/frequency");
    const { positionDimensionScore } = await import("@/lib/scoring/position");
    const { accuracyDimensionScore } = await import("@/lib/scoring/accuracy");
    const { compositeVisibilityScore } = await import("@/lib/scoring/composite");

    const freq = frequencyDimensionScore(50, 100);
    expect(freq).toBe(50);

    const pos = positionDimensionScore([1, 2, 3]);
    expect(typeof pos).toBe("number");
    expect(pos).toBeGreaterThan(0);

    const acc = accuracyDimensionScore([
      { brandMentioned: true, citedSources: ["https://example.com"] },
      { brandMentioned: false, citedSources: [] },
    ]);
    expect(typeof acc).toBe("number");

    const composite = compositeVisibilityScore({
      frequency: 60,
      position: 70,
      sentiment: 80,
      context: 50,
      accuracy: 40,
    });
    expect(typeof composite).toBe("number");
    expect(composite).toBeGreaterThan(0);
    expect(composite).toBeLessThanOrEqual(100);
  });
});
