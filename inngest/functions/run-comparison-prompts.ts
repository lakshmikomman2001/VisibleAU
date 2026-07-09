import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, comparisonPromptResults } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { inngest } from "@/lib/inngest/client";
import { runComparison } from "@/lib/conversational/comparison-runner";
import { isEngineEnabled } from "@/lib/feature-flags";
import { enginesForTier } from "@/lib/llm/tier-engines";
import type { Engine } from "@/lib/llm/interface";

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
    concurrency: { limit: 3 },
    triggers: [{ event: "audit.complete" }],
  },
  async ({ event, step }: { event: { data: { auditId: string; brandId: string; organizationId: string } }; step: any }) => {
    const { auditId, brandId, organizationId } = event.data;

    const context = await step.run("load-brand-competitors", async () => {
      const [brand] = await serviceDb
        .select()
        .from(brands)
        .where(eq(brands.id, brandId));
      if (!brand) throw new Error(`Brand ${brandId} not found`);

      if (!brand.competitors || brand.competitors.length === 0) {
        return { competitors: [] as string[], brandName: brand.name, brandDomain: brand.domain, tier: "free", engines: [] as Engine[] };
      }

      const [sub] = await serviceDb
        .select({ tier: subscriptions.tier })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, organizationId));

      const tier = sub?.tier ?? "free";
      const allEngines = enginesForTier(tier);
      const enabledEngines = (allEngines as readonly Engine[]).filter(
        (e) => isEngineEnabled(ENGINE_TO_PROVIDER[e] as "openai" | "anthropic" | "google" | "perplexity"),
      );

      return {
        competitors: brand.competitors,
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
      }
    }

    return { brandId, comparisonCount };
  },
);
