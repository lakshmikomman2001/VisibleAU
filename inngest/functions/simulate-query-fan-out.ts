import { eq } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, queryFanOutResults, verticalPackPrompts } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { formatLocation } from "@/lib/verticals/expand-prompt";
import { inngest } from "@/lib/inngest/client";
import { getLLMService } from "@/lib/llm";
import type { Engine } from "@/lib/llm/interface";
import { enginesForTier } from "@/lib/llm/tier-engines";
import { simulateQueryFanOut } from "@/lib/visibility/fan-out-simulator";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import type { Tier } from "@/db/schema/enums";

export const simulateQueryFanOutFn = inngest.createFunction(
  { id: "simulate-query-fan-out", retries: 2, concurrency: { limit: 5 }, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string; brandId?: string; organizationId?: string } }; step: any }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const context = await step.run("load-context", async () => {
      const [audit] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
      if (!audit) return null;

      const brandId = eventBrandId ?? audit.brandId;
      const orgId = eventOrgId ?? audit.organizationId;

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
      const auditEngines = (audit.metadata as Record<string, unknown>)?.engines as string[] | undefined;
      const engines = auditEngines ?? tierEngines.slice();

      return {
        brandId,
        organizationId: orgId,
        brandName: brand?.name ?? "Unknown",
        brandDomain: brand?.domain ?? "",
        location,
        tier,
        engines: engines as string[],
      };
    });

    if (!context) return { skipped: true, reason: "audit_not_found" };

    const budgetCheck = await step.run("check-budget", async () => {
      const estimate = await BudgetPolicyService.estimate({
        organizationId: context.organizationId,
        promptCount: 5,
      });
      const enforcement = await BudgetPolicyService.enforce(estimate, { hardStopOnBudget: true });
      return { allowed: enforcement.allowed, reason: enforcement.reason, estimatedCostCents: estimate.estimatedCostCents };
    });

    if (!budgetCheck.allowed) {
      return { skipped: true, reason: "budget_exceeded", estimatedCostCents: budgetCheck.estimatedCostCents };
    }

    const inserted = await step.run("fan-out-and-store", async () => {
      let count = 0;
      const llm = getLLMService();

      await withRlsContext(context.organizationId, async (tx) => {
        const prompts = await tx
          .select({ id: verticalPackPrompts.id, promptTemplate: verticalPackPrompts.promptTemplate, topic: verticalPackPrompts.topic })
          .from(verticalPackPrompts)
          .limit(5);

        for (const prompt of prompts) {
          const resolvedPrompt = prompt.promptTemplate.replace(/\{location\}/g, context.location);
          for (const engine of context.engines) {
            const fanOutResults = await simulateQueryFanOut({
              originalPrompt: resolvedPrompt,
              engine: engine as Engine,
              tier: context.tier,
              brandName: context.brandName,
              generateSubQueries: async (p, model, subQueryCount) => {
                const result = await llm.complete({
                  engine: engine as Engine,
                  prompt: `Generate ${subQueryCount} search sub-queries for: ${p}`,
                  task: "brand_mention",
                  model,
                });
                return result.response.split("\n").filter(Boolean).slice(0, subQueryCount);
              },
              checkBrandMention: async (subQuery, eng, model, brandName) => {
                const result = await llm.complete({
                  engine: eng,
                  prompt: subQuery,
                  task: "brand_mention",
                  model,
                });
                const mention = await detectBrandMention(result.response, {
                  name: brandName,
                  domain: context.brandDomain,
                });
                return { appeared: mention.found, position: mention.position, responseText: result.response };
              },
              computeSimilarity: (text1, text2) => {
                const words1 = new Set(text1.toLowerCase().split(/\s+/));
                const words2 = new Set(text2.toLowerCase().split(/\s+/));
                const intersection = [...words1].filter((w) => words2.has(w)).length;
                const union = new Set([...words1, ...words2]).size;
                return union === 0 ? 0 : intersection / union;
              },
            });

            for (const r of fanOutResults) {
              await tx.insert(queryFanOutResults).values({
                auditId,
                brandId: context.brandId,
                organizationId: context.organizationId,
                originalPrompt: resolvedPrompt,
                originalPromptId: prompt.id,
                engine,
                subQuery: r.subQuery,
                subQueryRank: r.subQueryRank,
                brandAppeared: r.brandAppeared,
                brandPosition: r.brandPosition,
                contentSimilarityScore: r.contentSimilarityScore?.toFixed(3) ?? "0.000",
                aboveThreshold: r.aboveThreshold,
              });
              count++;
            }
          }
        }
      });
      return count;
    });

    return { inserted };
  },
);
