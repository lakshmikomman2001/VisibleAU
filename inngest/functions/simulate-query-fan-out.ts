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

function cleanSubQueries(raw: string, max: number): string[] {
  return raw
    .split("\n")
    .map(l => l.trim())
    .map(l => l.replace(/^\s*\d+[.)]\s*/, ""))
    .map(l => l.replace(/^\s*[-*•]\s*/, ""))
    .map(l => l.replace(/\*\*/g, "").replace(/^#+\s*/, ""))
    .map(l => l.replace(/^["'`]|["'`]$/g, "").trim())
    .filter(Boolean)
    .filter(l => !/^-{2,}$/.test(l))
    .filter(l => !/^(certainly|here are|sure|below are|these are|of course)\b/i.test(l))
    .filter(l => l.length >= 3 && l.length <= 120)
    .filter(l => !l.endsWith(":"))
    .slice(0, max);
}

export const simulateQueryFanOutFn = inngest.createFunction(
  { id: "simulate-query-fan-out", retries: 2, concurrency: { limit: 5 }, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string; brandId?: string; organizationId?: string } }; step: any }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const result = await step.run("fan-out", async () => {
      const [audit] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
      if (!audit) return { skipped: true, reason: "audit_not_found", inserted: 0 };

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

      const estimate = await BudgetPolicyService.estimate({
        organizationId: orgId,
        brandId,
        promptCount: 5,
        engineCount: engines.length,
      });
      const enforcement = await BudgetPolicyService.enforce(estimate, { hardStopOnBudget: true });
      if (!enforcement.allowed) {
        return { skipped: true, reason: "budget_exceeded", inserted: 0, estimatedCostCents: estimate.estimatedCostCents };
      }

      const brandName = brand?.name ?? "Unknown";
      const brandDomain = brand?.domain ?? "";
      let count = 0;

      await withRlsContext(orgId, async (tx) => {
        const prompts = await tx
          .select({ id: verticalPackPrompts.id, promptTemplate: verticalPackPrompts.promptTemplate, topic: verticalPackPrompts.topic })
          .from(verticalPackPrompts)
          .limit(5);

        for (const prompt of prompts) {
          const resolvedPrompt = prompt.promptTemplate.replace(/\{location\}/g, location);
          for (const engine of engines) {
            try {
              const llm = getLLMService(engine as Engine);
              const fanOutResults = await simulateQueryFanOut({
                originalPrompt: resolvedPrompt,
                engine: engine as Engine,
                tier,
                brandName,
                generateSubQueries: async (p, model, subQueryCount) => {
                  try {
                    const r = await llm.complete({
                      engine: engine as Engine,
                      prompt: `Generate exactly ${subQueryCount} short search queries a real person might type into Google to find businesses related to: "${p}"\n\nReturn ONLY the queries, one per line. No preamble, no numbering, no bullet points, no markdown, no commentary. Each line must be a single standalone search query.`,
                      task: "brand_mention",
                      model,
                    });
                    return cleanSubQueries(r.response, subQueryCount);
                  } catch {
                    console.warn(`[fan-out] sub-query generation failed for ${engine}, skipping`);
                    return [];
                  }
                },
                checkBrandMention: async (subQuery, eng, model, bName) => {
                  try {
                    const r = await llm.complete({ engine: eng, prompt: subQuery, task: "brand_mention", model });
                    const mention = await detectBrandMention(r.response, { name: bName, domain: brandDomain });
                    return { appeared: mention.found, position: mention.position, responseText: r.response };
                  } catch {
                    return { appeared: false, position: null, responseText: "" };
                  }
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
                  brandId,
                  organizationId: orgId,
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
            } catch (err) {
              console.warn(`[fan-out] engine ${engine} failed for prompt "${resolvedPrompt.slice(0, 50)}...", skipping:`, err);
            }
          }
        }
      });
      return { inserted: count };
    });

    return result;
  },
);
