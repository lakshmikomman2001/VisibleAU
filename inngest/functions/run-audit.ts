import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  brands,
  citations,
  organizations,
  verticalPackPrompts,
  verticalPacks,
} from "@/db/schema";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { extractCitations } from "@/lib/audit/extract-citations";
import { inngest } from "@/lib/inngest/client";
import { getLLMService } from "@/lib/llm";
import type { Engine, MockScenario } from "@/lib/llm/interface";
import { enginesForTier, runsForTier } from "@/lib/llm/tier-engines";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { compositeVisibilityScore } from "@/lib/scoring/composite";
import { CONTEXT_SCORE_MAP, SENTIMENT_SCORE_MAP } from "@/lib/scoring/constants";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";
import { expandPrompt } from "@/lib/verticals/expand-prompt";

export const runAudit = inngest.createFunction(
  { id: "run-audit", retries: 2, triggers: [{ event: "audit.run" }] },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;
    const llm = getLLMService();

    try {
      const loaded = await step.run("load-audit", async () => {
        const [a] = await db.select().from(audits).where(eq(audits.id, auditId));
        const [b] = await db.select().from(brands).where(eq(brands.id, a.brandId));
        const [org] = await db
          .select({ tier: organizations.tier })
          .from(organizations)
          .where(eq(organizations.id, a.organizationId));

        const engines = enginesForTier(org?.tier);
        const rpp = runsForTier(org?.tier);
        if (engines.length === 0) {
          throw new Error(`Audit ${auditId}: resolved 0 engines for tier "${org?.tier}"`);
        }

        await db
          .update(audits)
          .set({ status: "running", startedAt: new Date(), engines: engines as Engine[], engineCount: engines.length })
          .where(eq(audits.id, auditId));

        return { audit: a, brand: b, engines: [...engines], runsPerPrompt: rpp };
      });

      const pack = await step.run("load-pack", async () => {
        const [p] = await db
          .select()
          .from(verticalPacks)
          .where(and(eq(verticalPacks.vertical, loaded.brand.vertical), eq(verticalPacks.region, loaded.brand.region), isNull(verticalPacks.retiredAt)));
        if (!p) {
          await db.update(audits).set({ status: "failed", failedAt: new Date(), metadata: sql`metadata || '{"error":"No vertical pack found."}'::jsonb` }).where(eq(audits.id, auditId));
          return null;
        }
        const promptRows = await db.select().from(verticalPackPrompts).where(eq(verticalPackPrompts.packId, p.id)).orderBy(asc(verticalPackPrompts.rank)).limit(10);
        const allExpanded = promptRows.flatMap((pr) => expandPrompt(pr.promptTemplate, { brand: loaded.brand, competitors: loaded.brand.competitors, locations: loaded.brand.primaryRegions.slice(0, 3) }));
        return { prompts: allExpanded.slice(0, 10) };
      });

      if (!pack) return { auditId, error: "pack_not_found" };
      const { prompts } = pack;
      if (prompts.length === 0) {
        await step.run("fail-empty", async () => {
          await db.update(audits).set({ status: "failed", failedAt: new Date(), metadata: sql`metadata || '{"error":"0 prompts."}'::jsonb` }).where(eq(audits.id, auditId));
        });
        return { auditId, error: "empty_pack_prompts" };
      }

      const { engines, runsPerPrompt } = loaded;
      let totalCost = 0;
      let mentionedCount = 0;
      const allPositions: (number | null)[] = [];
      const allSentiments: string[] = [];
      const allContexts: string[] = [];
      const citData: Array<{ brandMentioned: boolean; citedSources: unknown }> = [];

      for (const engine of engines) {
        for (let i = 0; i < prompts.length; i++) {
          for (let run = 1; run <= runsPerPrompt; run++) {
            const result = await step.run(`llm-${engine}-${i}-r${run}`, async () => {
              try {
                return await llm.complete({ engine: engine as Engine, prompt: prompts[i], task: "brand_mention", metadata: { mockScenario: (loaded.audit.metadata as { mockScenario?: MockScenario } | null)?.mockScenario } });
              } catch { return null; }
            });
            if (!result) continue;

            const sr = await step.run(`cite-${engine}-${i}-r${run}`, async () => {
              const mention = await detectBrandMention(result.response, loaded.brand);
              const sources = extractCitations(result.response);
              const sentLabel = mention.found ? "positive" : "neutral";
              const ctxLabel = mention.found ? "listed" : "mentioned";
              await db.insert(citations).values({ auditId, engine, prompt: prompts[i], runNumber: run, brandMentioned: mention.found, position: mention.position, sentimentLabel: sentLabel, contextLabel: ctxLabel, responseSnippet: result.response.slice(0, 500), citedSources: sources, llmCostUsd: result.costEstimateUsd.toString(), llmTokensUsed: result.tokensUsed, llmModel: result.model });
              return { found: mention.found, position: mention.position, sentLabel, ctxLabel, sources };
            });

            totalCost += result.costEstimateUsd;
            citData.push({ brandMentioned: sr.found, citedSources: sr.sources });
            if (sr.found) {
              mentionedCount++;
              allPositions.push(sr.position ?? null);
              allSentiments.push(sr.sentLabel);
              allContexts.push(sr.ctxLabel);
            }
          }
        }
      }

      const totalCalls = engines.length * prompts.length * runsPerPrompt;

      await step.run("finalize", async () => {
        const freqScore = frequencyDimensionScore(mentionedCount, totalCalls);
        const posScore = positionDimensionScore(allPositions);
        const sentScore = allSentiments.length > 0 ? allSentiments.reduce((s, l) => s + (SENTIMENT_SCORE_MAP[l as keyof typeof SENTIMENT_SCORE_MAP] ?? 50), 0) / allSentiments.length : 50;
        const ctxScore = allContexts.length > 0 ? allContexts.reduce((s, l) => s + (CONTEXT_SCORE_MAP[l as keyof typeof CONTEXT_SCORE_MAP] ?? 25), 0) / allContexts.length : 25;
        const accScore = accuracyDimensionScore(citData);
        const composite = compositeVisibilityScore({ frequency: freqScore, position: posScore, sentiment: sentScore, context: ctxScore, accuracy: accScore });

        const mentionRows = citData.filter((c) => c.brandMentioned);
        const accWithSrc = mentionRows.filter((c) => { const s = c.citedSources as unknown[]; return Array.isArray(s) && s.length > 0; }).length;
        const cis = computeDimensionCIs({ freqScore, posScore, sentScore, ctxScore, accScore, composite, mentionedCount, totalCalls, mentionRowCount: mentionRows.length, accWithSourcesCount: accWithSrc });

        await db.update(audits).set({
          status: "complete",
          scoreComposite: composite.toFixed(2),
          scoreFrequency: freqScore.toFixed(2),
          scorePosition: posScore.toFixed(2),
          scoreSentiment: allSentiments[0] ?? "neutral",
          scoreSentimentNumeric: sentScore.toFixed(2),
          scoreContext: allContexts[0] ?? "mentioned",
          scoreContextNumeric: ctxScore.toFixed(2),
          scoreAccuracy: accScore.toFixed(2),
          scoreConfidenceLow: cis.composite.lower.toFixed(2),
          scoreConfidenceHigh: cis.composite.upper.toFixed(2),
          confidenceIntervals: cis,
          totalCostUsd: totalCost.toFixed(4),
          engines: engines as string[],
          engineCount: engines.length,
          promptsCount: prompts.length,
          runsPerPrompt,
          totalCalls,
          completedAt: new Date(),
        }).where(eq(audits.id, auditId));
      });

      await step.sendEvent("audit-complete-email", { name: "audit.complete", data: { auditId } });
      return { auditId, totalCost };
    } catch (err) {
      await db.update(audits).set({ status: "failed", failedAt: new Date(), metadata: { error: err instanceof Error ? err.message : String(err) } }).where(eq(audits.id, auditId)).catch(() => {});
      throw err;
    }
  },
);
