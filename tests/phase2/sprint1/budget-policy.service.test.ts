import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db/client", () => ({
  serviceDb: {
    select: () => ({
      from: () => ({
        where: mockSelect,
      }),
    }),
    insert: () => ({
      values: mockInsert,
    }),
    update: () => ({
      set: () => ({
        where: mockUpdate,
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  audits: {
    id: "id",
    organizationId: "organization_id",
    estimatedCostCents: "estimated_cost_cents",
  },
  organizations: { id: "id", slug: "slug", tier: "tier" },
}));

vi.mock("@/db/schema/subscriptions", () => ({
  subscriptions: { organizationId: "organization_id", tier: "tier" },
}));

vi.mock("@/db/schema/market-ai-budget-policies", () => ({
  marketAiBudgetPolicies: {
    id: "id",
    marketCode: "market_code",
    segment: "segment",
    useCase: "use_case",
    maxEstimatedCostCents: "max_estimated_cost_cents",
    hardStopOnBudget: "hard_stop_on_budget",
  },
}));

vi.mock("@/db/schema/audit-cost-snapshots", () => ({
  auditCostSnapshots: { id: "id", auditId: "audit_id", organizationId: "organization_id" },
}));

vi.mock("@/lib/llm/tier-engines", () => ({
  TIER_ENGINES: {
    free: ["chatgpt", "perplexity"],
    starter: ["chatgpt", "claude", "gemini", "perplexity"],
    growth: ["chatgpt", "claude", "gemini", "perplexity"],
  },
  // Vunnara Build 1, Part F.1: the replay loop is gone -- always 1.
  RUNS_PER_PROMPT: 1,
}));

// Build 1 addendum, item 5: isWebSearchEnabled mocked deterministically
// (grounding ON by default, matching real production behaviour) so
// these tests' expected cents figures don't depend on ambient env
// vars -- searchFeeUsd itself is the real, pure pricing table.
vi.mock("@/lib/llm/web-search-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/web-search-config")>();
  return { ...actual, isWebSearchEnabled: vi.fn(() => true) };
});

vi.mock("@/lib/platform/observability.service", () => ({
  ObservabilityService: { emit: vi.fn() },
}));

import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";

describe("BudgetPolicyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
  });

  describe("estimate", () => {
    it("reads subscriptions.tier (not organizations.tier)", async () => {
      // org returns tier=free, but subscription says tier=growth
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [{ id: "org-1", slug: "test-org" }]; // org
        if (callCount === 2) return [{ tier: "growth" }]; // subscription — source of truth
        return [{ maxEstimatedCostCents: 500, id: "policy-1" }]; // policy
      });

      const result = await BudgetPolicyService.estimate({
        brandId: "brand-1",
        organizationId: "org-1",
        promptCount: 10,
        engineCount: 4,
      });

      expect(result).toHaveProperty("estimatedCostCents");
      expect(result).toHaveProperty("withinBudget");
      expect(result).toHaveProperty("policyId");
    });
  });

  describe("enforce", () => {
    it("throws when over budget + hard_stop_on_budget=true", async () => {
      const estimate = {
        estimatedCostCents: 1000,
        maxAllowedCents: 500,
        withinBudget: false,
        policyId: "policy-1",
      };

      const result = await BudgetPolicyService.enforce(estimate, {
        hardStopOnBudget: true,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("budget_exceeded");
    });

    it("allows when within budget", async () => {
      const estimate = {
        estimatedCostCents: 200,
        maxAllowedCents: 500,
        withinBudget: true,
        policyId: "policy-1",
      };

      const result = await BudgetPolicyService.enforce(estimate, {
        hardStopOnBudget: true,
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("ok");
    });
  });

  describe("record", () => {
    it("skips org.slug='sample'", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [{ organizationId: "org-1", estimatedCostCents: 100 }];
        if (callCount === 2) return [{ slug: "sample" }];
        return [];
      });

      // Should not throw and should not attempt insert (sample org excluded)
      await expect(BudgetPolicyService.record("audit-1", 1.5)).resolves.toBeUndefined();
    });

    it("returns early when audit not found", async () => {
      mockSelect.mockResolvedValueOnce([]);
      await expect(BudgetPolicyService.record("nonexistent", 1.0)).resolves.toBeUndefined();
    });
  });

  describe("estimate edge cases", () => {
    it("falls back to free tier (2 engines) when no subscription row", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [{ id: "org-1", slug: "test-org" }];
        if (callCount === 2) return []; // no subscription
        return [{ maxEstimatedCostCents: 500, id: "policy-1" }];
      });

      const result = await BudgetPolicyService.estimate({
        brandId: "brand-1",
        organizationId: "org-1",
        promptCount: 10,
        engineCount: 2,
      });

      // Build 1 addendum, item 5: estimate() is now grounding-aware --
      // free tier (chatgpt + perplexity): chatgpt is grounded (default
      // ON, mocked above) so its per-call cost is 0.015 + 0.01 search
      // fee = 0.025; perplexity has no search fee of its own, so stays
      // 0.015. 10 prompts × 1 run × (0.025 + 0.015) = US$0.40.
      // AUD cents: Math.round(0.40 × (100/0.65)) = Math.round(61.54) = 62
      expect(result.estimatedCostCents).toBe(62);
      expect(result.withinBudget).toBe(true);
    });

    it("defaults to ceiling 500 when no policy row exists", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [{ id: "org-1", slug: "test-org" }];
        if (callCount === 2) return [{ tier: "growth" }];
        return []; // no policy row
      });

      const result = await BudgetPolicyService.estimate({
        brandId: "brand-1",
        organizationId: "org-1",
        promptCount: 10,
        engineCount: 4,
      });

      expect(result.maxAllowedCents).toBe(500);
      expect(result.policyId).toBe("default");
    });

    it("canon arithmetic: growth tier 10 prompts, grounding-aware (Build 1 addendum, item 5)", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [{ id: "org-1", slug: "test-org" }];
        if (callCount === 2) return [{ tier: "growth" }];
        return [{ maxEstimatedCostCents: 550, id: "policy-1" }];
      });

      const result = await BudgetPolicyService.estimate({
        brandId: "brand-1",
        organizationId: "org-1",
        promptCount: 10,
        engineCount: 4,
      });

      // Build 1 addendum, item 5: estimate() is now grounding-aware --
      // growth tier (chatgpt + claude + gemini + perplexity), all
      // grounded (default ON, mocked above): chatgpt 0.015+0.01=0.025,
      // claude 0.015+0.01=0.025, gemini 0.015+0.035=0.05, perplexity
      // 0.015 (no search fee of its own). Sum = 0.115/call.
      // 10 prompts × 1 run × 0.115 = US$1.15 → Math.round(1.15 × 100/0.65) = Math.round(176.92) = 177
      expect(result.estimatedCostCents).toBe(177);
      expect(result.withinBudget).toBe(true);
    });

    it("zero promptCount produces zero cost", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [{ id: "org-1", slug: "test-org" }];
        if (callCount === 2) return [{ tier: "growth" }];
        return [{ maxEstimatedCostCents: 500, id: "policy-1" }];
      });

      const result = await BudgetPolicyService.estimate({
        brandId: "brand-1",
        organizationId: "org-1",
        promptCount: 0,
        engineCount: 4,
      });

      expect(result.estimatedCostCents).toBe(0);
      expect(result.withinBudget).toBe(true);
    });

    it("an engine with grounding off (Build 1 addendum, item 5) drops its search fee from the estimate", async () => {
      const { isWebSearchEnabled } = await import("@/lib/llm/web-search-config");
      vi.mocked(isWebSearchEnabled).mockReturnValueOnce(false); // chatgpt only (first call)

      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [{ id: "org-1", slug: "test-org" }];
        if (callCount === 2) return [{ tier: "free" }]; // chatgpt + perplexity
        return [{ maxEstimatedCostCents: 500, id: "policy-1" }];
      });

      const result = await BudgetPolicyService.estimate({
        brandId: "brand-1",
        organizationId: "org-1",
        promptCount: 10,
        engineCount: 2,
      });

      // chatgpt ungrounded this once: 0.015 (no fee) + perplexity 0.015
      // (never has a fee) = 0.03/call. 10 × 1 × 0.03 = US$0.30.
      // Math.round(0.30 × 100/0.65) = Math.round(46.15) = 46 -- the
      // OLD flat-rate figure, now reached only when nothing is grounded.
      expect(result.estimatedCostCents).toBe(46);
    });
  });

  // Build 1 addendum, item 5: checkDailySpend() reads ACTUAL recorded
  // cost (not the estimate above) -- confirms the guard trips at the
  // real total once grounded calls' search fees are included in what
  // gets recorded (lib/llm/*-impl.ts's costEstimateUsd, summed into
  // auditCostSnapshots.actualCostCents by BudgetPolicyService.record()).
  describe("checkDailySpend trips at the real recorded total (Build 1 addendum, item 5)", () => {
    it("blocks once recorded spend (token + search fees) reaches the cap, not a moment before", async () => {
      process.env.DAILY_SPEND_CAP_CENTS = "100";
      mockSelect.mockResolvedValueOnce([{ total: 99 }]);
      const justUnder = await BudgetPolicyService.checkDailySpend("org-1");
      expect(justUnder.allowed).toBe(true);

      mockSelect.mockResolvedValueOnce([{ total: 100 }]);
      const atCap = await BudgetPolicyService.checkDailySpend("org-1");
      expect(atCap.allowed).toBe(false);

      delete process.env.DAILY_SPEND_CAP_CENTS;
    });

    // Vunnara Build 1, final reconcile, item 3: record() takes a real
    // USD dollar amount (what the LLM providers actually bill) and
    // converts it to AU-cents via the SAME USD_TO_AUD_RATE checkDailySpend's
    // cap is denominated in -- this proves that whole chain end to end,
    // not just that the comparison inside checkDailySpend works once
    // something is already in AU-cents (the other tests in this file
    // mock `total` as a pre-converted number and never exercise the
    // conversion itself).
    it("a real USD spend that converts to exactly the AU-cents cap trips the guard, proving record() and checkDailySpend() agree on currency", async () => {
      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return [{ organizationId: "org-1", estimatedCostCents: 0 }];
        if (selectCallCount === 2) return [{ slug: "not-sample" }];
        return [{ id: "policy-1" }];
      });

      // US$65.00 * (100/0.65) = 10,000 AU-cents exactly -- the default
      // DAILY_SPEND_CAP_CENTS, chosen so the conversion lands on the
      // boundary with no floating-point rounding ambiguity.
      await BudgetPolicyService.record("audit-1", 65.0);

      expect(mockInsert).toHaveBeenCalledTimes(1);
      const inserted = mockInsert.mock.calls[0][0];
      expect(inserted.actualCostCents).toBe(10_000);

      // What record() actually wrote is what a real day's accumulated
      // auditCostSnapshots.actualCostCents SUM would be -- feed that
      // real figure back into checkDailySpend() and confirm it trips
      // the default cap at exactly the boundary.
      mockSelect.mockReset();
      mockSelect.mockResolvedValueOnce([{ total: inserted.actualCostCents }]);
      const result = await BudgetPolicyService.checkDailySpend("org-1");
      expect(result.allowed).toBe(false);
      expect(result.spentTodayCents).toBe(result.capCents);
    });
  });

  describe("enforce edge cases", () => {
    it("allows when over budget but hardStopOnBudget=false", async () => {
      const result = await BudgetPolicyService.enforce(
        { estimatedCostCents: 1000, maxAllowedCents: 500, withinBudget: false, policyId: "p1" },
        { hardStopOnBudget: false },
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("ok");
    });

    it("allows when exactly at budget boundary", async () => {
      const result = await BudgetPolicyService.enforce(
        { estimatedCostCents: 500, maxAllowedCents: 500, withinBudget: true, policyId: "p1" },
        { hardStopOnBudget: true },
      );
      expect(result.allowed).toBe(true);
    });
  });

  // Vunnara Build 1, Part G.8: a second, independent backstop beyond
  // enforce()'s per-audit estimate -- bounds actual spend already
  // recorded today per org, since web search (Part G) made per-prompt
  // cost variable and provider-dependent.
  describe("checkDailySpend", () => {
    afterEach(() => {
      delete process.env.DAILY_SPEND_CAP_CENTS;
    });

    it("allows when today's recorded spend is below the default AU$100 cap", async () => {
      mockSelect.mockResolvedValueOnce([{ total: 500 }]);

      const result = await BudgetPolicyService.checkDailySpend("org-1");

      expect(result.allowed).toBe(true);
      expect(result.spentTodayCents).toBe(500);
      expect(result.capCents).toBe(10_000);
    });

    it("blocks when today's recorded spend is at or over the cap", async () => {
      mockSelect.mockResolvedValueOnce([{ total: 10_000 }]);

      const result = await BudgetPolicyService.checkDailySpend("org-1");

      expect(result.allowed).toBe(false);
      expect(result.spentTodayCents).toBe(10_000);
    });

    it("treats no rows today as zero spend, not a failure", async () => {
      mockSelect.mockResolvedValueOnce([{ total: 0 }]);

      const result = await BudgetPolicyService.checkDailySpend("org-1");

      expect(result.allowed).toBe(true);
      expect(result.spentTodayCents).toBe(0);
    });

    it("honours DAILY_SPEND_CAP_CENTS override", async () => {
      process.env.DAILY_SPEND_CAP_CENTS = "200";
      mockSelect.mockResolvedValueOnce([{ total: 250 }]);

      const result = await BudgetPolicyService.checkDailySpend("org-1");

      expect(result.capCents).toBe(200);
      expect(result.allowed).toBe(false);
    });

    it("emits audit_daily_spend_exceeded when blocked", async () => {
      const { ObservabilityService } = await import("@/lib/platform/observability.service");
      mockSelect.mockResolvedValueOnce([{ total: 10_000 }]);

      await BudgetPolicyService.checkDailySpend("org-1");

      expect(ObservabilityService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "audit_daily_spend_exceeded" }),
      );
    });
  });

  describe("getPhase2CostTarget", () => {
    it("returns defined cost targets for known functions", () => {
      expect(BudgetPolicyService.getPhase2CostTarget("generate-content-draft")).toBe(15);
      expect(BudgetPolicyService.getPhase2CostTarget("simulate-query-fan-out")).toBe(25);
      expect(BudgetPolicyService.getPhase2CostTarget("score-agent-readiness")).toBe(5);
    });

    it("returns undefined for unknown functions", () => {
      expect(BudgetPolicyService.getPhase2CostTarget("nonexistent")).toBeUndefined();
    });
  });
});
