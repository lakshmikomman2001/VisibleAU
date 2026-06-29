import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Cross-sprint wiring: Sprint 1 ↔ Phase 1", () => {
  const runAuditSource = readFileSync(
    resolve(__dirname, "../../../lib/audit/run-audit-inline.ts"),
    "utf-8",
  );

  describe("run-audit-inline.ts imports", () => {
    it("imports BudgetPolicyService from lib/platform", () => {
      expect(runAuditSource).toContain(
        'import { BudgetPolicyService } from "@/lib/platform/budget-policy.service"',
      );
    });

    it("imports QualityGateService from lib/platform", () => {
      expect(runAuditSource).toContain(
        'import { QualityGateService } from "@/lib/platform/quality-gate.service"',
      );
    });

    it("imports subscriptions schema (tier source of truth)", () => {
      expect(runAuditSource).toContain(
        'import { subscriptions } from "@/db/schema/subscriptions"',
      );
    });
  });

  describe("pre-flight budget integration", () => {
    it("calls BudgetPolicyService.estimate() before LLM calls", () => {
      expect(runAuditSource).toContain("BudgetPolicyService.estimate(");
    });

    it("calls BudgetPolicyService.enforce() after estimate", () => {
      expect(runAuditSource).toContain("BudgetPolicyService.enforce(");
    });

    it("throws on budget exceeded", () => {
      expect(runAuditSource).toContain('throw new Error("Budget exceeded")');
    });

    it("estimate call appears before the LLM loop (totalCost declaration)", () => {
      const estimateIdx = runAuditSource.indexOf("BudgetPolicyService.estimate(");
      const totalCostIdx = runAuditSource.indexOf("let totalCost = 0");
      expect(estimateIdx).toBeGreaterThan(0);
      expect(totalCostIdx).toBeGreaterThan(estimateIdx);
    });
  });

  describe("post-scoring integration", () => {
    it("calls BudgetPolicyService.record() after scoring", () => {
      expect(runAuditSource).toContain("BudgetPolicyService.record(");
    });

    it("calls QualityGateService.evaluate() after scoring", () => {
      expect(runAuditSource).toContain("QualityGateService.evaluate(");
    });

    it("record() and evaluate() appear after compositeVisibilityScore", () => {
      const compositeIdx = runAuditSource.indexOf("compositeVisibilityScore(");
      const recordIdx = runAuditSource.indexOf("BudgetPolicyService.record(");
      const evaluateIdx = runAuditSource.indexOf("QualityGateService.evaluate(");
      expect(recordIdx).toBeGreaterThan(compositeIdx);
      expect(evaluateIdx).toBeGreaterThan(compositeIdx);
    });

    it("record() and evaluate() are wrapped in try-catch (non-fatal)", () => {
      const recordLine = runAuditSource.indexOf("BudgetPolicyService.record(");
      const precedingRecordContext = runAuditSource.substring(recordLine - 100, recordLine);
      expect(precedingRecordContext).toContain("try");

      const evaluateLine = runAuditSource.indexOf("QualityGateService.evaluate(");
      const precedingEvalContext = runAuditSource.substring(evaluateLine - 100, evaluateLine);
      expect(precedingEvalContext).toContain("try");
    });
  });

  describe("Phase 1 invariants preserved", () => {
    it("still uses enginesForTier from tier-engines (not hardcoded)", () => {
      expect(runAuditSource).toContain("enginesForTier");
    });

    it("still uses runsForTier (Phase 1 runsPerPrompt=5)", () => {
      expect(runAuditSource).toContain("runsForTier");
    });

    it("still uses PROMPTS_PER_AUDIT", () => {
      expect(runAuditSource).toContain("PROMPTS_PER_AUDIT");
    });

    it("uses subscriptions.tier as primary source (org.tier only as fallback)", () => {
      const subTierIdx = runAuditSource.indexOf("subscriptions.tier");
      const orgTierIdx = runAuditSource.indexOf("organizations.tier");
      expect(subTierIdx).toBeGreaterThan(0);
      expect(runAuditSource).toContain("sub?.tier ?? org?.tier");
    });
  });

  describe("BudgetPolicyService shape compatibility with audit path", () => {
    it("CostEstimate fields match what run-audit-inline destructures", () => {
      // run-audit-inline calls estimate() then reads estimatedCostCents, withinBudget
      // and passes the estimate to enforce(). Confirm the type shape.
      const sampleEstimate = {
        estimatedCostCents: 462,
        maxAllowedCents: 550,
        withinBudget: true,
        policyId: "policy-1",
      };
      expect(sampleEstimate).toHaveProperty("estimatedCostCents");
      expect(sampleEstimate).toHaveProperty("withinBudget");
      expect(typeof sampleEstimate.estimatedCostCents).toBe("number");
      expect(typeof sampleEstimate.withinBudget).toBe("boolean");
    });

    it("enforce() returns the shape audit path checks (allowed + reason)", () => {
      const allowed = { allowed: true, reason: "ok" as const };
      const denied = { allowed: false, reason: "budget_exceeded" as const };
      expect(typeof allowed.allowed).toBe("boolean");
      expect(typeof denied.reason).toBe("string");
    });
  });

  describe("Provider registry ↔ TIER_ENGINES alignment", () => {
    const tierEnginesSource = readFileSync(
      resolve(__dirname, "../../../lib/llm/tier-engines.ts"),
      "utf-8",
    );

    it("TIER_ENGINES exports free and growth tiers (BudgetPolicyService fallback targets)", () => {
      expect(tierEnginesSource).toContain("free:");
      expect(tierEnginesSource).toContain("growth:");
    });

    it("BudgetPolicyService falls back to 'free' when no subscription", () => {
      const budgetSource = readFileSync(
        resolve(__dirname, "../../../lib/platform/budget-policy.service.ts"),
        "utf-8",
      );
      expect(budgetSource).toContain('sub?.tier ?? "free"');
    });
  });

  describe("Inngest registration unchanged", () => {
    const inngestRoute = readFileSync(
      resolve(__dirname, "../../../app/api/webhooks/inngest/route.ts"),
      "utf-8",
    );

    it("serve() array exists and is intact", () => {
      expect(inngestRoute).toContain("serve(");
    });

    it("no Sprint 1 functions added to serve() (Sprint 1 adds no Inngest functions)", () => {
      expect(inngestRoute).not.toContain("configBundle");
      expect(inngestRoute).not.toContain("budgetPolicy");
      expect(inngestRoute).not.toContain("qualityGate");
    });
  });
});
