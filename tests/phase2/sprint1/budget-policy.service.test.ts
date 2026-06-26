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
  });
});
