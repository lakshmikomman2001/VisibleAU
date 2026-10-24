import { eq } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, verticalPackPrompts } from "@/db/schema";
import type { Tier } from "@/db/schema/enums";
import { subscriptions } from "@/db/schema/subscriptions";
import { isQuerySimulationEnabled } from "@/lib/feature-flags";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { enginesForTier } from "@/lib/llm/tier-engines";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { formatLocation } from "@/lib/verticals/expand-prompt";
import { fanOutEngineLoop } from "@/lib/visibility/fan-out-engine-loop";

export const simulateQueryFanOutFn = inngest.createFunction(
  {
    id: "simulate-query-fan-out",
    retries: 2,
    // "Inngest: fit within the 5 concurrent steps of the free plan",
    // item 1 -- replaces this function's own previous, independent
    // concurrency: { limit: 5 } (fn-scoped, unrelated to the account-
    // wide contention problem) with the shared post-audit pool.
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { auditId: string; brandId?: string; organizationId?: string } };
    step: any;
  }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    // "Pause query simulation" (Sri's decision, 23 Oct) -- checked
    // first, before any step.run: a plain env read needs none of
    // Inngest's durability (nothing here can "partially fail" and need
    // replaying), and returning before the first step means a paused
    // run makes zero LLM calls, records zero cost, and writes zero
    // rows -- not even the "load-brand-competitors"-style read step
    // the other post-audit functions start with. The function stays
    // registered (still listens on audit.complete, still holds its
    // POST_AUDIT_POOL slot definition) so turning this back on needs
    // no Inngest resync -- only an env change. See
    // docs/backlog/query-simulation-fix.md for the real fix.
    if (!isQuerySimulationEnabled()) {
      return { skipped: true, reason: "query_simulation_disabled", inserted: 0 };
    }

    const result = await step.run("fan-out", async () => {
      const audit = await loadScopedOrAbort({
        fn: "simulate-query-fan-out",
        entityId: auditId,
        load: async () => (await serviceDb.select().from(audits).where(eq(audits.id, auditId)))[0],
        eventOrganizationId: eventOrgId,
        eventBrandId,
      });
      if (!audit)
        return { skipped: true, reason: "audit_not_found_or_scope_mismatch", inserted: 0 };

      const brandId = audit.brandId;
      const orgId = audit.organizationId;

      const [brand] = await serviceDb
        .select({ name: brands.name, domain: brands.domain, primaryRegions: brands.primaryRegions })
        .from(brands)
        .where(eq(brands.id, brandId));

      const location = formatLocation(brand?.primaryRegions?.[0], "local area");

      const [sub] = await serviceDb
        .select({ tier: subscriptions.tier })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId));

      const tier = (sub?.tier ?? "free") as Tier;
      const tierEngines = enginesForTier(tier);
      const auditEngines = (audit.metadata as Record<string, unknown>)?.engines as
        | string[]
        | undefined;
      const engines = auditEngines ?? tierEngines.slice();

      const estimate = await BudgetPolicyService.estimate({
        organizationId: orgId,
        brandId,
        promptCount: 5,
        engineCount: engines.length,
      });
      const enforcement = await BudgetPolicyService.enforce(estimate, { hardStopOnBudget: true });
      if (!enforcement.allowed) {
        return {
          skipped: true,
          reason: "budget_exceeded",
          inserted: 0,
          estimatedCostCents: estimate.estimatedCostCents,
        };
      }

      const dailySpend = await BudgetPolicyService.checkDailySpend(orgId);
      if (!dailySpend.allowed) {
        return {
          skipped: true,
          reason: "daily_cap_exceeded",
          inserted: 0,
          estimatedCostCents: estimate.estimatedCostCents,
        };
      }

      const brandName = brand?.name ?? "Unknown";
      const brandDomain = brand?.domain ?? "";

      let count = 0;
      // "Inngest: fit within the 5 concurrent steps of the free
      // plan", item 3 -- this function's real LLM calls (generate-
      // SubQueries + checkBrandMention, up to 4 engines x 5 prompts x
      // 13 calls each) were never recorded anywhere before this: not
      // in audit_cost_snapshots, not in audits.total_cost_usd. The
      // pre-flight estimate/enforce/checkDailySpend above only ever
      // checked a budget BEFORE the real calls; nothing recorded what
      // they actually cost afterwards.
      let totalCostUsd = 0;
      let unpricedReserveUsd: number | undefined;
      await withRlsContext(orgId, async (tx) => {
        const prompts = await tx
          .select({
            id: verticalPackPrompts.id,
            promptTemplate: verticalPackPrompts.promptTemplate,
            topic: verticalPackPrompts.topic,
          })
          .from(verticalPackPrompts)
          .limit(5);

        const result = await fanOutEngineLoop(tx, {
          auditId,
          brandId,
          organizationId: orgId,
          engines: engines as string[],
          tier,
          brandName,
          brandDomain,
          prompts: prompts.map((p) => ({ id: p.id, promptTemplate: p.promptTemplate })),
          location,
        });
        count = result.inserted;
        totalCostUsd = result.totalCostUsd;
        unpricedReserveUsd = result.unpricedReserveUsd;
      });

      if (totalCostUsd > 0 || unpricedReserveUsd !== undefined) {
        try {
          await BudgetPolicyService.record(
            auditId,
            totalCostUsd,
            "simulate-query-fan-out",
            unpricedReserveUsd,
          );
        } catch (recordErr) {
          console.error(
            "[simulate-query-fan-out] cost snapshot record failed (non-fatal):",
            recordErr,
          );
        }
      }

      return { inserted: count, totalCostUsd };
    });

    return result;
  },
);
