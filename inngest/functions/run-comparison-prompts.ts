import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, comparisonPromptResults } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { selectComparisonCompetitors } from "@/lib/brands/competitor-limits";
import { runComparison } from "@/lib/conversational/comparison-runner";
import { isEngineEnabled } from "@/lib/feature-flags";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import type { Engine } from "@/lib/llm/interface";
import { enginesForTier } from "@/lib/llm/tier-engines";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";

const ENGINE_TO_PROVIDER = {
  chatgpt: "openai",
  claude: "anthropic",
  gemini: "google",
  perplexity: "perplexity",
} as const;

export const runComparisonPromptsFn = inngest.createFunction(
  {
    id: "run-comparison-prompts",
    retries: 2,
    // "Inngest: fit within the 5 concurrent steps of the free plan",
    // item 1 -- replaces this function's own previous, independent
    // concurrency: { limit: 3 } (fn-scoped, unrelated to the account-
    // wide contention problem) with the shared post-audit pool.
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { auditId: string; brandId: string; organizationId: string } };
    step: any;
  }) => {
    const { auditId, brandId, organizationId } = event.data;

    const context = await step.run("load-brand-competitors", async () => {
      const [brand] = await serviceDb.select().from(brands).where(eq(brands.id, brandId));
      if (!brand) throw new Error(`Brand ${brandId} not found`);

      if (!brand.competitors || brand.competitors.length === 0) {
        return {
          competitors: [] as string[],
          brandName: brand.name,
          brandDomain: brand.domain,
          tier: "free",
          engines: [] as Engine[],
        };
      }

      const [sub] = await serviceDb
        .select({ tier: subscriptions.tier })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, organizationId));

      const tier = sub?.tier ?? "free";
      const allEngines = enginesForTier(tier);
      const enabledEngines = (allEngines as readonly Engine[]).filter((e) =>
        isEngineEnabled(ENGINE_TO_PROVIDER[e] as "openai" | "anthropic" | "google" | "perplexity"),
      );

      // "Cap competitor comparisons", item 2 -- only the first
      // MAX_COMPARISON_COMPETITORS confirmed competitors are compared
      // each audit. A brand with MORE than N stored stays exactly as
      // stored; only which ones get COMPARED is capped.
      return {
        competitors: selectComparisonCompetitors(brand.competitors),
        brandName: brand.name,
        brandDomain: brand.domain,
        tier,
        engines: enabledEngines as Engine[],
      };
    });

    if (context.competitors.length === 0) {
      return { skipped: true, reason: "no_competitors" };
    }

    if (context.engines.length === 0) {
      console.warn(`run-comparison-prompts: 0 enabled engines for brand ${brandId} — skipping`);
      return { skipped: true, reason: "no_enabled_engines" };
    }

    let comparisonCount = 0;
    // "Inngest: fit within the 5 concurrent steps of the free plan",
    // item 3 -- this function's real LLM call per (competitor,
    // engine) was never recorded anywhere before this; it didn't
    // even have a pre-flight budget/daily-cap check, unlike
    // simulate-query-fan-out.ts.
    let totalCostUsd = 0;

    for (const competitorDomain of context.competitors) {
      for (const engine of context.engines) {
        const result = await step.run(`compare-${competitorDomain}-${engine}`, async () => {
          return runComparison({
            brandName: context.brandName,
            brandDomain: context.brandDomain,
            competitorDomain,
            engine,
            tier: context.tier,
          });
        });

        await step.run(`persist-${competitorDomain}-${engine}`, async () => {
          await serviceDb.insert(comparisonPromptResults).values({
            brandId,
            organizationId,
            auditId,
            competitorDomain,
            prompt: result.prompt,
            engine,
            brandWon: result.brandWon,
            brandMentioned: result.brandMentioned,
            competitorMentioned: result.competitorMentioned,
            verdictSnippet: result.verdictSnippet,
          });
        });

        comparisonCount++;
        totalCostUsd += result.costEstimateUsd;
      }
    }

    if (totalCostUsd > 0) {
      await step.run("record-cost", async () => {
        try {
          await BudgetPolicyService.record(auditId, totalCostUsd, "run-comparison-prompts");
        } catch (recordErr) {
          console.error("[run-comparison-prompts] cost snapshot record failed (non-fatal):", recordErr);
        }
      });
    }

    return { brandId, comparisonCount, totalCostUsd };
  },
);
