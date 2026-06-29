import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockSelect,
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockUpdate,
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  audits: { id: "id", organizationId: "organization_id", estimatedCostCents: "estimated_cost_cents" },
  organizations: { id: "id", slug: "slug", tier: "tier" },
}));

vi.mock("@/db/schema/subscriptions", () => ({
  subscriptions: { organizationId: "organization_id", tier: "tier" },
}));

vi.mock("@/db/schema/market-ai-budget-policies", () => ({
  marketAiBudgetPolicies: { id: "id", marketCode: "market_code", segment: "segment", useCase: "use_case", maxEstimatedCostCents: "max_estimated_cost_cents", hardStopOnBudget: "hard_stop_on_budget" },
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
}));

vi.mock("@/lib/platform/observability.service", () => ({
  ObservabilityService: { emit: vi.fn() },
}));

import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";

describe("BudgetPolicyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      // free tier: 10 prompts × 2 engines × 5 runs × 0.015 = US$1.50
      // AUD cents: Math.round(1.50 × (100/0.65)) = Math.round(230.77) = 231
      expect(result.estimatedCostCents).toBe(231);
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

    it("canon arithmetic: growth tier 10 prompts = 462 AUD cents", async () => {
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

      // 10 × 4 × 5 × 0.015 = US$3.00 → Math.round(3.00 × 100/0.65) = Math.round(461.54) = 462
      expect(result.estimatedCostCents).toBe(462);
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
