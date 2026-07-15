import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands, conversationJourneys, journeyRunResults } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { inngest } from "@/lib/inngest/client";
import { runJourneyTurn } from "@/lib/conversational/journey-runner";
import { scoreJourney } from "@/lib/conversational/journey-scorer";
import { isEngineEnabled } from "@/lib/feature-flags";
import { enginesForTier } from "@/lib/llm/tier-engines";
import { formatLocation } from "@/lib/verticals/expand-prompt";
import type { Engine } from "@/lib/llm/interface";
import type { JourneyTurn, TurnResult } from "@/lib/conversational/types";

const VERTICAL_SERVICE_LABELS: Record<string, string> = {
  tradies: "tradies",
  allied_health: "health practitioners",
  saas: "software tools",
  professional_services: "professional service firms",
  real_estate: "real estate agents",
};

const ENGINE_TO_PROVIDER = {
  chatgpt: "openai",
  claude: "anthropic",
  gemini: "google",
  perplexity: "perplexity",
} as const;

export const runJourneyFn = inngest.createFunction(
  {
    id: "run-journey",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ event: "journey/run-requested" }],
  },
  async ({ event, step }: { event: { data: { journeyId: string; brandId: string; organizationId: string } }; step: any }) => {
    const { journeyId, brandId, organizationId } = event.data;

    const context = await step.run("load-journey", async () => {
      const [journey] = await serviceDb
        .select()
        .from(conversationJourneys)
        .where(eq(conversationJourneys.id, journeyId));
      if (!journey) throw new Error(`Journey ${journeyId} not found`);

      const [brand] = await serviceDb
        .select()
        .from(brands)
        .where(eq(brands.id, brandId));
      if (!brand) throw new Error(`Brand ${brandId} not found`);

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
        journeyName: journey.journeyName,
        promptSequence: journey.promptSequence as JourneyTurn[],
        brandName: brand.name,
        serviceType: VERTICAL_SERVICE_LABELS[brand.vertical] ?? "services",
        location: formatLocation(brand.primaryRegions?.[0], "your area"),
        tier,
        engines: enabledEngines as Engine[],
      };
    });

    if (context.engines.length === 0) {
      console.warn(`run-journey: 0 enabled engines for journey ${journeyId} — skipping`);
      return { skipped: true, reason: "no_enabled_engines" };
    }

    for (const engine of context.engines) {
      const turnResults: TurnResult[] = [];
      const conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

      for (const turn of context.promptSequence) {
        const result = await step.run(`turn-${turn.turn}-${engine}`, async () => {
          return runJourneyTurn({
            turn,
            brandName: context.brandName,
            serviceType: context.serviceType,
            location: context.location,
            engine,
            tier: context.tier,
            conversationHistory,
          });
        });

        turnResults.push(result.turnResult);
        conversationHistory.push(
          { role: "user" as const, content: result.turnResult.prompt },
          { role: "assistant" as const, content: result.assistantResponse },
        );
      }

      await step.run(`persist-${engine}`, async () => {
        const score = scoreJourney(turnResults);
        await serviceDb.insert(journeyRunResults).values({
          journeyId,
          brandId,
          organizationId,
          engine,
          turnResults,
          brandAppearedInNTurns: score.brandAppearedInNTurns,
          totalTurns: score.totalTurns,
          journeyScore: score.journeyScore.toFixed(2),
          firstMentionTurn: score.firstMentionTurn,
        });
      });
    }

    return { journeyId, engines: context.engines.length };
  },
);
