import { and, eq, gte, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, organizations } from "@/db/schema";
import { auditCostSnapshots } from "@/db/schema/audit-cost-snapshots";
import { marketAiBudgetPolicies } from "@/db/schema/market-ai-budget-policies";
import { subscriptions } from "@/db/schema/subscriptions";
import { RUNS_PER_PROMPT, TIER_ENGINES } from "@/lib/llm/tier-engines";
import { isWebSearchEnabled, searchFeeUsd } from "@/lib/llm/web-search-config";
import { ObservabilityService } from "./observability.service";
import type { AuditParams, CostEstimate, DailySpendCheck, EnforcementResult } from "./types";

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

// Money convention (LLD 4744): every real cost this product tracks
// comes from the LLM providers in USD (citations.llmCostUsd, audits.
// totalCostUsd -- what the audit header's "US$..." figure reads
// directly). This rate converts that real USD figure into AU-CENTS at
// the one point it needs to be comparable to an AUD-denominated
// guardrail -- both estimate() and record() below apply it, so every
// value that reaches auditCostSnapshots.actualCostCents, and the
// DAILY_SPEND_CAP_CENTS it's compared against in checkDailySpend(),
// are in the same currency and the same unit. The header's own
// "(≈ A$...)" display figure is a separate, independent conversion
// for the same reason -- showing the org's own currency alongside the
// real USD cost, never feeding back into any guardrail.
const USD_TO_AUD_RATE = 100 / 0.65;

// Vunnara Build 1, Part G.8: web search (Part G) made per-prompt cost
// variable and provider-dependent instead of the old flat per-call
// rate, so a single runaway org (bad prompt pack, a retry storm) can no
// longer be bounded by the per-audit estimate alone -- this is a second,
// independent backstop on top of BudgetPolicyService.enforce(), checked
// against what was actually spent today, not estimated.
const DEFAULT_DAILY_SPEND_CAP_CENTS = 10_000; // AU$100/day/org; override via DAILY_SPEND_CAP_CENTS env var

export class BudgetPolicyService {
  static async estimate(params: AuditParams): Promise<CostEstimate> {
    const [org] = await serviceDb
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, params.organizationId));

    const [sub] = await serviceDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, params.organizationId));

    const tier = sub?.tier ?? "free";

    const [policy] = await serviceDb
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

    // Canon: 200 calls ≈ US$3 → ~US$0.015/call
    const baseCostPerCall = 0.015;
    // Vunnara Build 1, Part F.4: this hardcoded `* 5` assumed the old
    // runs-per-prompt replay loop (removed in Part F.1 -- every run
    // after the first replayed a cached response, never a real
    // additional API call) -- it was estimating cost at 5x what an
    // audit actually spends, risking a false "budget_exceeded" block
    // on a perfectly affordable audit now that only run 1 is real.
    //
    // Build 1 addendum, item 5: flagged in Part G as not grounding-
    // aware -- fixed here. Summed per engine (not a flat count *
    // baseCostPerCall) so each engine's own search fee (web-search-
    // config.ts's searchFeeUsd, $0 for an engine with grounding off,
    // or for perplexity which has no fee of its own) only applies
    // where it's real.
    const engines = TIER_ENGINES[tier] ?? TIER_ENGINES.free;
    const perCallCostUsd = engines.reduce((sum, engine) => {
      const grounded = engine !== "perplexity" && isWebSearchEnabled(engine);
      const fee =
        engine === "chatgpt" || engine === "claude" || engine === "gemini"
          ? searchFeeUsd(engine, grounded)
          : 0;
      return sum + baseCostPerCall + fee;
    }, 0);
    const estimatedCostUsd = params.promptCount * RUNS_PER_PROMPT * perCallCostUsd;
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

  static async checkDailySpend(organizationId: string): Promise<DailySpendCheck> {
    const capCents = Number(process.env.DAILY_SPEND_CAP_CENTS) || DEFAULT_DAILY_SPEND_CAP_CENTS;

    const [row] = await serviceDb
      .select({
        total: sql<number>`COALESCE(SUM(${auditCostSnapshots.actualCostCents}), 0)::int`,
      })
      .from(auditCostSnapshots)
      .where(
        and(
          eq(auditCostSnapshots.organizationId, organizationId),
          gte(auditCostSnapshots.createdAt, sql`date_trunc('day', now())`),
        ),
      );

    const spentTodayCents = row?.total ?? 0;
    const allowed = spentTodayCents < capCents;

    if (!allowed) {
      ObservabilityService.emit({
        name: "audit_daily_spend_exceeded",
        data: { organizationId, spentTodayCents, capCents },
      });
    }

    return { allowed, spentTodayCents, capCents };
  }

  static async record(auditId: string, actualCostUsd: number): Promise<void> {
    const [audit] = await serviceDb
      .select({
        organizationId: audits.organizationId,
        estimatedCostCents: audits.estimatedCostCents,
      })
      .from(audits)
      .where(eq(audits.id, auditId));
    if (!audit) return;

    const [org] = await serviceDb
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, audit.organizationId));

    // Skip sample org (D-03, O-03)
    if (org?.slug === "sample") return;

    const actualCostCents = Math.round(actualCostUsd * USD_TO_AUD_RATE);

    const [policy] = await serviceDb
      .select({ id: marketAiBudgetPolicies.id })
      .from(marketAiBudgetPolicies)
      .where(
        and(
          eq(marketAiBudgetPolicies.marketCode, "AU_EN"),
          eq(marketAiBudgetPolicies.segment, "smb"),
          eq(marketAiBudgetPolicies.useCase, "brand_audit"),
        ),
      );

    await serviceDb.insert(auditCostSnapshots).values({
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
