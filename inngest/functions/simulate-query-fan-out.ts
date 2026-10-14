import { eq } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, verticalPackPrompts } from "@/db/schema";
import type { Tier } from "@/db/schema/enums";
import { subscriptions } from "@/db/schema/subscriptions";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import { enginesForTier } from "@/lib/llm/tier-engines";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { formatLocation } from "@/lib/verticals/expand-prompt";
import { fanOutEngineLoop } from "@/lib/visibility/fan-out-engine-loop";

export const simulateQueryFanOutFn = inngest.createFunction(
  {
    id: "simulate-query-fan-out",
    retries: 2,
    concurrency: { limit: 5 },
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

      const brandName = brand?.name ?? "Unknown";
      const brandDomain = brand?.domain ?? "";

      let count = 0;
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
      });
      return { inserted: count };
    });

    return result;
  },
);
