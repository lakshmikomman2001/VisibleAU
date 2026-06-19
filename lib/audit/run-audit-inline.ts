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
import { getLLMService } from "@/lib/llm";
import type { Engine, ModelTask, MockScenario } from "@/lib/llm/interface";
import type { Tier } from "@/db/schema/enums";
import { selectModel } from "@/lib/llm/model-selector";
import { enginesForTier, runsForTier } from "@/lib/llm/tier-engines";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { compositeVisibilityScore } from "@/lib/scoring/composite";
import { CONTEXT_SCORE_MAP, SENTIMENT_SCORE_MAP } from "@/lib/scoring/constants";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";
import { expandPrompt } from "@/lib/verticals/expand-prompt";

export async function runAuditInline(auditId: string): Promise<void> {

  const [a] = await db.select().from(audits).where(eq(audits.id, auditId));
  if (!a) throw new Error(`Audit ${auditId} not found`);

  const [b] = await db.select().from(brands).where(eq(brands.id, a.brandId));
  if (!b) throw new Error(`Brand ${a.brandId} not found`);

  const [org] = await db
    .select({ tier: organizations.tier })
    .from(organizations)
    .where(eq(organizations.id, a.organizationId));

  const engines = enginesForTier(org?.tier);
  const runsPerPrompt = runsForTier(org?.tier);

  await db
    .update(audits)
    .set({
      status: "running",
      startedAt: new Date(),
      engines: engines as Engine[],
      engineCount: engines.length,
    })
    .where(eq(audits.id, auditId));

  try {
    const [p] = await db
      .select()
      .from(verticalPacks)
      .where(
        and(
          eq(verticalPacks.vertical, b.vertical),
          eq(verticalPacks.region, b.region),
          isNull(verticalPacks.retiredAt),
        ),
      );

    if (!p) {
      await db
        .update(audits)
        .set({
          status: "failed",
          failedAt: new Date(),
          metadata: sql`metadata || '{"error": "No vertical pack found."}'::jsonb`,
        })
        .where(eq(audits.id, auditId));
      return;
    }

    const promptRows = await db
      .select()
      .from(verticalPackPrompts)
      .where(eq(verticalPackPrompts.packId, p.id))
      .orderBy(asc(verticalPackPrompts.rank))
      .limit(10);

    const allExpanded = promptRows.flatMap((pr) =>
      expandPrompt(pr.promptTemplate, {
        brand: b,
        competitors: b.competitors,
        locations: b.primaryRegions.slice(0, 3),
      }),
    );
    const prompts = allExpanded.slice(0, 10);

    if (prompts.length === 0) {
      await db
        .update(audits)
        .set({
          status: "failed",
          failedAt: new Date(),
          metadata: sql`metadata || '{"error": "Pack found but contains 0 prompts."}'::jsonb`,
        })
        .where(eq(audits.id, auditId));
      return;
    }

    let totalCost = 0;
    const allPositions: (number | null)[] = [];
    const allSentiments: string[] = [];
    const allContexts: string[] = [];
    const citationData: Array<{ brandMentioned: boolean; citedSources: unknown }> = [];
    let mentionedCount = 0;

    for (const engine of engines) {
      const llm = getLLMService(engine);
      for (let i = 0; i < prompts.length; i++) {
        for (let run = 1; run <= runsPerPrompt; run++) {
          try {
            const tier = (org?.tier ?? "free") as Tier;
            const model = selectModel(tier, engine, "brand_mention" as ModelTask);
            const result = await llm.complete({
              engine: engine as Engine,
              prompt: prompts[i],
              task: "brand_mention",
              model,
              metadata: {
                mockScenario: (a.metadata as { mockScenario?: MockScenario } | null)?.mockScenario,
              },
            });

            const mention = await detectBrandMention(result.response, b);
            const sources = extractCitations(result.response);

            const sentimentLabel = mention.found ? "positive" : "neutral";
            const contextLabel = mention.found ? "listed" : "mentioned";

            await db.insert(citations).values({
              auditId,
              engine: engine as string,
              prompt: prompts[i],
              runNumber: run,
              brandMentioned: mention.found,
              position: mention.position,
              sentimentLabel,
              contextLabel,
              responseSnippet: result.response.slice(0, 500),
              citedSources: sources,
              llmCostUsd: result.costEstimateUsd.toString(),
              llmTokensUsed: result.tokensUsed,
              llmModel: result.model,
            });

            if (mention.found) {
              mentionedCount++;
              allPositions.push(mention.position ?? null);
              allSentiments.push(sentimentLabel);
              allContexts.push(contextLabel);
            }
            citationData.push({ brandMentioned: mention.found, citedSources: sources });
            totalCost += result.costEstimateUsd;
          } catch (callErr) {
            console.error(`[audit-inline] ${engine} prompt=${i} run=${run} FAILED:`, callErr instanceof Error ? callErr.message : callErr);
          }
        }
      }
    }

    const totalCalls = engines.length * prompts.length * runsPerPrompt;

    // Compute 5-dimension scores
    const freqScore = frequencyDimensionScore(mentionedCount, totalCalls);
    const posScore = positionDimensionScore(allPositions);

    const sentLabels = allSentiments as Array<keyof typeof SENTIMENT_SCORE_MAP>;
    const sentScore =
      sentLabels.length > 0
        ? sentLabels.reduce((s, l) => s + (SENTIMENT_SCORE_MAP[l] ?? 50), 0) / sentLabels.length
        : 50;

    const ctxLabels = allContexts as Array<keyof typeof CONTEXT_SCORE_MAP>;
    const ctxScore =
      ctxLabels.length > 0
        ? ctxLabels.reduce((s, l) => s + (CONTEXT_SCORE_MAP[l] ?? 25), 0) / ctxLabels.length
        : 25;

    const accScore = accuracyDimensionScore(citationData);

    const composite = compositeVisibilityScore({
      frequency: freqScore,
      position: posScore,
      sentiment: sentScore,
      context: ctxScore,
      accuracy: accScore,
    });

    // Per-dimension 95% CIs
    const mentionRows = citationData.filter((c) => c.brandMentioned);
    const accWithSources = mentionRows.filter((c) => {
      const s = c.citedSources as unknown[];
      return Array.isArray(s) && s.length > 0;
    }).length;
    const cis = computeDimensionCIs({
      freqScore, posScore, sentScore, ctxScore, accScore, composite,
      mentionedCount, totalCalls, mentionRowCount: mentionRows.length,
      accWithSourcesCount: accWithSources,
    });

    await db
      .update(audits)
      .set({
        status: "complete",
        scoreComposite: composite.toFixed(2),
        scoreFrequency: freqScore.toFixed(2),
        scorePosition: posScore.toFixed(2),
        scoreSentiment: sentLabels.length > 0 ? sentLabels[0] : "neutral",
        scoreSentimentNumeric: sentScore.toFixed(2),
        scoreContext: ctxLabels.length > 0 ? ctxLabels[0] : "mentioned",
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
      })
      .where(eq(audits.id, auditId));
  } catch (err) {
    await db
      .update(audits)
      .set({
        status: "failed",
        failedAt: new Date(),
        metadata: { error: err instanceof Error ? err.message : String(err) },
      })
      .where(eq(audits.id, auditId))
      .catch(() => {});
  }
}
