import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, organizations } from "@/db/schema";
import { auditCostSnapshots } from "@/db/schema/audit-cost-snapshots";
import { marketAiBudgetPolicies } from "@/db/schema/market-ai-budget-policies";
import { subscriptions } from "@/db/schema/subscriptions";
import { TIER_ENGINES } from "@/lib/llm/tier-engines";
import { ObservabilityService } from "./observability.service";
import type { AuditParams, CostEstimate, EnforcementResult } from "./types";

// Per-function Phase 2 cost targets (LLD 5014-5040)
// Protect ~85-92% margin; Growth+ adds <US$2.31/mo per brand
const PHASE2_COST_TARGETS_CENTS: Record<string, number> = {
  "generate-content-draft": 15,
  "simulate-query-fan-out": 25,
  "calculate-share-of-voice": 10,
  "detect-hallucinations": 12,
  "run-journey": 30,
  "run-comparison-prompts": 20,
  "content-structure-audit": 8,
  "score-agent-readiness": 5,
};

const USD_TO_AUD_RATE = 100 / 0.65;

export class BudgetPolicyService {
  static async estimate(params: AuditParams): Promise<CostEstimate> {
    const [org] = await db
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, params.organizationId));

    const [sub] = await db
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, params.organizationId));

    const tier = sub?.tier ?? "free";
    const engineCount = TIER_ENGINES[tier]?.length ?? 2;

    const [policy] = await db
      .select()
      .from(marketAiBudgetPolicies)
      .where(
        and(
          eq(marketAiBudgetPolicies.marketCode, "AU_EN"),
          eq(marketAiBudgetPolicies.segment, "smb"),
          eq(marketAiBudgetPolicies.useCase, "brand_audit"),
        ),
      );

    const maxAllowedCents = policy?.maxEstimatedCostCents ?? 500;
    const policyId = policy?.id ?? "default";

    const baseCostPerCall = 0.25;
    const estimatedCostUsd =
      params.promptCount * engineCount * 5 * baseCostPerCall;
    const estimatedCostCents = Math.round(estimatedCostUsd * USD_TO_AUD_RATE);

    const estimate: CostEstimate = {
      estimatedCostCents,
      maxAllowedCents,
      withinBudget: estimatedCostCents <= maxAllowedCents,
      policyId,
    };

    ObservabilityService.emit({
      name: "audit_budget_estimated",
      data: {
        organizationId: params.organizationId,
        tier,
        estimatedCostCents,
        maxAllowedCents,
        withinBudget: estimate.withinBudget,
      },
    });

    return estimate;
  }

  static async enforce(
    estimate: CostEstimate,
    policy: { hardStopOnBudget: boolean },
  ): Promise<EnforcementResult> {
    if (!estimate.withinBudget && policy.hardStopOnBudget) {
      ObservabilityService.emit({
        name: "audit_budget_exceeded",
        data: {
          estimatedCostCents: estimate.estimatedCostCents,
          maxAllowedCents: estimate.maxAllowedCents,
        },
      });
      return { allowed: false, reason: "budget_exceeded" };
    }
    return { allowed: true, reason: "ok" };
  }

  static async record(
    auditId: string,
    actualCostUsd: number,
  ): Promise<void> {
    const [audit] = await db
      .select({
        organizationId: audits.organizationId,
        estimatedCostCents: audits.estimatedCostCents,
      })
      .from(audits)
      .where(eq(audits.id, auditId));
    if (!audit) return;

    const [org] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, audit.organizationId));

    // Skip sample org (D-03, O-03)
    if (org?.slug === "sample") return;

    const actualCostCents = Math.round(actualCostUsd * USD_TO_AUD_RATE);

    const [policy] = await db
      .select({ id: marketAiBudgetPolicies.id })
      .from(marketAiBudgetPolicies)
      .where(
        and(
          eq(marketAiBudgetPolicies.marketCode, "AU_EN"),
          eq(marketAiBudgetPolicies.segment, "smb"),
          eq(marketAiBudgetPolicies.useCase, "brand_audit"),
        ),
      );

    await db.insert(auditCostSnapshots).values({
      auditId,
      organizationId: audit.organizationId,
      marketCode: "AU_EN",
      locale: "en-AU",
      estimatedCostCents: audit.estimatedCostCents ?? 0,
      actualCostCents,
      promptCount: 0,
      providerCallCount: 0,
      budgetPolicyId: policy?.id ?? null,
    });
  }

  static getPhase2CostTarget(functionName: string): number | undefined {
    return PHASE2_COST_TARGETS_CENTS[functionName];
  }
}
