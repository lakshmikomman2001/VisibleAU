import { and, desc, eq, ne, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { actionItems, audits, brands, citations, driftAlerts } from "@/db/schema";
import type { Tier } from "@/db/schema/enums";
import { subscriptions } from "@/db/schema/subscriptions";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { extractCitations, mergeCitedSources } from "@/lib/audit/extract-citations";
import { getAuditPrompts } from "@/lib/audit/get-audit-prompts";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { type AuditCallOutcome, selectOrganicCitations } from "@/lib/audit/organic-citations";
import { buildEngineLocation } from "@/lib/brands/region-label";
import { detectDrift } from "@/lib/drift/detect";
import type { CompositeBasis } from "@/lib/drift/types";
import { getLLMService } from "@/lib/llm";
import type { Engine, MockScenario, ModelTask } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { enginesForTier, PROMPTS_PER_AUDIT, runsForTier } from "@/lib/llm/tier-engines";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { QualityGateService } from "@/lib/platform/quality-gate.service";
import {
  buildRecommendations,
  gatherRecommendationEvidence,
  productionCheckers,
} from "@/lib/recommendations";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { compositeVisibilityScore } from "@/lib/scoring/composite";
import { contextDimensionScore } from "@/lib/scoring/context";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { sentimentDimensionScore } from "@/lib/scoring/sentiment";

export async function runAuditInline(auditId: string): Promise<void> {
  const [a] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
  if (!a) throw new Error(`Audit ${auditId} not found`);

  const [b] = await serviceDb.select().from(brands).where(eq(brands.id, a.brandId));
  if (!b) throw new Error(`Brand ${a.brandId} not found`);

  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, a.organizationId));

  const effectiveTier = sub?.tier ?? "free";
  const engines = enginesForTier(effectiveTier);
  const runsPerPrompt = runsForTier(effectiveTier);

  await serviceDb
    .update(audits)
    .set({
      status: "running",
      startedAt: new Date(),
      engines: engines as Engine[],
      engineCount: engines.length,
    })
    .where(eq(audits.id, auditId));

  try {
    const prompts = await getAuditPrompts(b, PROMPTS_PER_AUDIT);

    if (prompts.length === 0) {
      await serviceDb
        .update(audits)
        .set({
          status: "failed",
          failedAt: new Date(),
          metadata: sql`metadata || '{"error": "No prompts available."}'::jsonb`,
        })
        .where(eq(audits.id, auditId));
      return;
    }

    await serviceDb
      .update(audits)
      .set({
        promptsCount: prompts.length,
        runsPerPrompt,
        totalCalls: engines.length * prompts.length * runsPerPrompt,
      })
      .where(eq(audits.id, auditId));

    // Phase 2: pre-flight budget estimate + hard-stop enforcement
    try {
      const estimate = await BudgetPolicyService.estimate({
        brandId: a.brandId,
        organizationId: a.organizationId,
        promptCount: prompts.length,
        engineCount: engines.length,
      });
      await serviceDb
        .update(audits)
        .set({ estimatedCostCents: estimate.estimatedCostCents })
        .where(eq(audits.id, auditId));

      const enforcement = await BudgetPolicyService.enforce(estimate, {
        hardStopOnBudget: true,
      });
      if (!enforcement.allowed) {
        throw new Error("Budget exceeded");
      }

      const dailySpend = await BudgetPolicyService.checkDailySpend(a.organizationId);
      if (!dailySpend.allowed) {
        throw new Error("Daily spend cap exceeded");
      }
    } catch (budgetErr) {
      if (
        budgetErr instanceof Error &&
        (budgetErr.message === "Budget exceeded" || budgetErr.message === "Daily spend cap exceeded")
      ) {
        throw budgetErr;
      }
      console.error("[audit-inline] budget estimate failed (non-fatal):", budgetErr);
    }

    let totalCost = 0;
    const callOutcomes: AuditCallOutcome[] = [];

    const tier = (effectiveTier ?? "free") as Tier;
    const mockScenario = (a.metadata as { mockScenario?: MockScenario } | null)?.mockScenario;

    async function runOneCall(engine: Engine, promptIdx: number, run: number) {
      const llm = getLLMService(engine);
      const model = selectModel(tier, engine, "brand_mention" as ModelTask);
      const result = await llm.complete({
        engine: engine as Engine,
        prompt: prompts[promptIdx].text,
        task: "brand_mention",
        model,
        location: buildEngineLocation(b),
        metadata: { mockScenario },
      });

      const mention = await detectBrandMention(result.response, b);
      // Task #43: Perplexity's real cited sources arrive as structured
      // URLs (result.citedUrls), not necessarily in the response text --
      // merge both. For engines without structured sources, citedUrls is
      // undefined and this is a no-op (extractCitations' result alone).
      const sources = mergeCitedSources(extractCitations(result.response), result.citedUrls);
      const sentimentLabel = mention.found ? "positive" : "neutral";
      const contextLabel = mention.found ? "listed" : "absent";

      await serviceDb.insert(citations).values({
        auditId,
        engine,
        prompt: prompts[promptIdx].text,
        isBrandedPrompt: prompts[promptIdx].isBranded,
        runNumber: run,
        brandMentioned: mention.found,
        position: mention.position,
        sentimentLabel,
        contextLabel,
        responseSnippet: result.response.slice(0, 500),
        // Task #46 Phase 3, Part B: the full answer, permanently. On a
        // cache hit result.response is already the full cached text
        // (lib/llm/cache.ts getCached() returns llm_response_cache.response
        // untruncated), so no special-casing is needed.
        responseText: result.response,
        citedSources: sources,
        llmCostUsd: result.costEstimateUsd.toString(),
        llmTokensUsed: result.tokensUsed,
        llmModel: result.model,
        isCacheHit: result.isCacheHit,
      });

      return {
        found: mention.found,
        position: mention.position,
        sentimentLabel,
        contextLabel,
        sources,
        cost: result.costEstimateUsd,
        isBranded: prompts[promptIdx].isBranded,
        runNumber: run,
      };
    }

    // Build 1 addendum, item 6: one engine's search failure (thrown by
    // Part G's impls on an in-band tool error) must never fail the
    // whole audit, but it must also never be INVISIBLE -- a failed
    // call writes no citation row (so it's already excluded from the
    // organic sample and never counted as "not mentioned"), but until
    // now nothing else recorded that it happened at all. Counted here
    // per engine, persisted into audits.metadata.engineFailures below.
    const engineFailures: Record<string, number> = {};

    // Vunnara Build 1, Part F.1: one real LLM call per (engine, prompt),
    // always -- the replay loop this used to run `runsPerPrompt` times
    // is gone; runsPerPrompt is now always RUNS_PER_PROMPT (1) via
    // runsForTier, kept as a stored/displayed count, not a loop bound.
    async function runEngine(engine: Engine) {
      const batch = prompts.map((_, i) =>
        runOneCall(engine, i, 1).catch((callErr) => {
          console.error(
            `[audit-inline] ${engine} prompt=${i} FAILED:`,
            callErr instanceof Error ? callErr.message : callErr,
          );
          engineFailures[engine] = (engineFailures[engine] ?? 0) + 1;
          return null;
        }),
      );
      const results = await Promise.all(batch);
      for (const r of results) {
        if (!r) continue;
        totalCost += r.cost;
        callOutcomes.push({
          isBranded: r.isBranded,
          brandMentioned: r.found,
          position: r.position,
          sentimentLabel: r.sentimentLabel,
          contextLabel: r.contextLabel,
          citedSources: r.sources,
          runNumber: r.runNumber,
        });
      }
    }

    await Promise.all(engines.map((engine) => runEngine(engine as Engine)));

    const totalCalls = engines.length * prompts.length * runsPerPrompt;

    // Every dimension is scored from the ORGANIC subset only (task HH) --
    // a branded prompt guarantees a trivial mention and must not inflate
    // Frequency, Position, Sentiment, Context, or Accuracy. `totalCalls`
    // above (audit size/cost, unaffected) stays the real total; only the
    // scoring inputs below use the organic-filtered counts.
    const organic = selectOrganicCitations(callOutcomes);

    // Compute 5-dimension scores
    const freqScore = frequencyDimensionScore(organic.mentionedCount, organic.totalCalls);
    const posScore = positionDimensionScore(organic.positions);

    const sentScore = sentimentDimensionScore(
      organic.sentiments as Parameters<typeof sentimentDimensionScore>[0],
    );
    const ctxScore = contextDimensionScore(
      organic.contexts as Parameters<typeof contextDimensionScore>[0],
    );

    const accScore = accuracyDimensionScore(organic.citationData);

    const composite = compositeVisibilityScore({
      frequency: freqScore,
      position: posScore,
      sentiment: sentScore,
      context: ctxScore,
      accuracy: accScore,
    });

    // Per-dimension 95% CIs. Task SSS: the LLM cache key has no run index
    // (sha256(prompt + model) only), so 4 of every 5 "runs" replay the
    // exact cached response from run 1 -- not independent trials. Feed the
    // interval the TRUE sample size (distinct runNumber===1 observations),
    // not the replay-inflated totalCalls/mentionRows -- otherwise the
    // margin is ~sqrt(5) narrower than the evidence supports. The scores
    // above (freqScore, composite, etc.) are untouched by this and stay
    // byte-identical: every replay is identical to its run-1 original, so
    // the proportion is the same either way.
    const cis = computeDimensionCIs({
      freqScore,
      posScore,
      sentScore,
      ctxScore,
      accScore,
      composite,
      mentionedCount: organic.distinctMentionedCount,
      totalCalls: organic.distinctSampleCount,
      mentionRowCount: organic.distinctMentionedCount,
      accWithSourcesCount: organic.distinctAccWithSourcesCount,
    });

    await serviceDb
      .update(audits)
      .set({
        status: "complete",
        scoreComposite: composite.toFixed(2),
        scoreFrequency: freqScore.toFixed(2),
        scorePosition: posScore.toFixed(2),
        scoreSentiment: organic.sentiments.length > 0 ? organic.sentiments[0] : "neutral",
        scoreSentimentNumeric: sentScore.toFixed(2),
        scoreContext: organic.contexts.length > 0 ? organic.contexts[0] : "absent",
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
        // Build 1 addendum, item 6: merged, never overwritten --
        // metadata already carries mockScenario (set at audit-creation
        // time) and must keep it.
        ...(Object.keys(engineFailures).length > 0
          ? { metadata: sql`metadata || ${JSON.stringify({ engineFailures })}::jsonb` }
          : {}),
      })
      .where(eq(audits.id, auditId));

    // Phase 2: post-scoring — record cost snapshot and evaluate quality gates
    try {
      await BudgetPolicyService.record(auditId, totalCost);
    } catch (recordErr) {
      console.error("[audit-inline] cost snapshot record failed (non-fatal):", recordErr);
    }
    try {
      await QualityGateService.evaluate(auditId);
    } catch (qgErr) {
      console.error("[audit-inline] quality gate evaluation failed (non-fatal):", qgErr);
    }

    // Drift detection — compare with previous audit for same brand
    try {
      await withRlsContext(a.organizationId, async (tx) => {
        const [previous] = await tx
          .select()
          .from(audits)
          .where(
            and(
              eq(audits.brandId, a.brandId),
              ne(audits.id, auditId),
              eq(audits.status, "complete"),
            ),
          )
          .orderBy(desc(audits.createdAt))
          .limit(1);

        if (!previous) {
          console.log(
            "[audit-inline] drift check: skipped — no previous completed audit for this brand",
          );
          return;
        }

        const currentScores: Record<string, number> = {
          frequency: freqScore,
          position: posScore,
          sentiment: sentScore,
          context: ctxScore,
          accuracy: accScore,
        };
        const previousScores: Record<string, number> = {
          frequency: Number(previous.scoreFrequency ?? 50),
          position: Number(previous.scorePosition ?? 50),
          sentiment: Number(previous.scoreSentimentNumeric ?? 50),
          context: Number(previous.scoreContextNumeric ?? 25),
          accuracy: Number(previous.scoreAccuracy ?? 50),
        };
        const previousCIs =
          (previous.confidenceIntervals as Record<string, { lower: number; upper: number }>) ?? {};

        // Task #46 Phase 2, Part 1: detectDrift now needs each side's
        // composite basis + CI, not just the raw dimension scores/CIs,
        // so it can gate composite drift on a basis mismatch (see
        // lib/drift/detect.ts's own doc comment). Current basis is
        // exactly this audit's own mention gate; the previous audit's
        // basis is the same rule applied to ITS organic run_number=1
        // mention count, not a heuristic.
        const [{ previousMentionedCount }] = await tx
          .select({
            previousMentionedCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
          })
          .from(citations)
          .where(and(eq(citations.auditId, previous.id), ORGANIC_ONLY, eq(citations.runNumber, 1)));

        const currentCompositeBasis: CompositeBasis =
          organic.distinctMentionedCount === 0 ? "frequency_only" : "weighted";
        const previousCompositeBasis: CompositeBasis =
          Number(previousMentionedCount) === 0 ? "frequency_only" : "weighted";
        const WIDE_CI = { lower: 0, upper: 100 };

        const driftResult = detectDrift({
          currentScores,
          previousScores,
          currentCIs: cis as unknown as Record<string, { lower: number; upper: number }>,
          previousCIs,
          currentComposite: composite,
          previousComposite: Number(previous.scoreComposite ?? 0),
          currentCompositeBasis,
          previousCompositeBasis,
          currentCompositeCI: cis.composite,
          previousCompositeCI: previousCIs.composite ?? WIDE_CI,
        });

        console.log(
          `[audit-inline] drift check: current=${composite.toFixed(1)} previous=${Number(previous.scoreComposite ?? 0).toFixed(1)} delta=${driftResult.scoreDelta.toFixed(1)} severity=${driftResult.compositeSeverity} significant=${driftResult.hasSignificant}`,
        );

        if (driftResult.hasSignificant) {
          await tx.insert(driftAlerts).values({
            organizationId: a.organizationId,
            brandId: a.brandId,
            currentAuditId: auditId,
            previousAuditId: previous.id,
            severity: driftResult.compositeSeverity,
            scoreDelta: String(driftResult.scoreDelta),
            dimensionDeltas: driftResult.dimensionDeltas,
          });
        }
      });
    } catch (driftErr) {
      console.error(
        "[audit-inline] drift detection failed:",
        driftErr instanceof Error ? driftErr.message : driftErr,
      );
    }

    // Recommendation generation — same logic as generate-recommendations Inngest function
    try {
      // Real brand-specific checks (directories, Wikipedia, crawled page
      // dates) run here, OUTSIDE the transaction below -- they're network
      // calls with their own timeouts and never throw (a failed check
      // becomes "unavailable" and downgrades that one recommendation).
      const evidence = await gatherRecommendationEvidence(
        { brandId: a.brandId, brandName: b.name },
        productionCheckers(serviceDb),
      );
      await withRlsContext(a.organizationId, async (tx) => {
        const recs = await buildRecommendations(
          {
            scoreFrequency: freqScore.toFixed(2),
            scorePosition: posScore.toFixed(2),
            scoreSentimentNumeric: sentScore.toFixed(2),
            scoreContextNumeric: ctxScore.toFixed(2),
            scoreAccuracy: accScore.toFixed(2),
            scoreComposite: composite.toFixed(2),
            confidenceIntervals: cis,
            vertical: b.vertical,
            mentionRowCount: organic.distinctMentionedCount,
          },
          tx,
          evidence,
        );

        if (recs.length > 0) {
          await tx
            .insert(actionItems)
            .values(
              recs.map((rec) => ({
                organizationId: a.organizationId,
                brandId: a.brandId,
                auditId,
                recommendationKey: rec.recommendationKey,
                dimension: rec.dimension,
                title: rec.title,
                action: rec.action,
                confidenceLabel: rec.confidenceLabel,
                expectedImpactScore: rec.expectedImpactScore,
                evidenceRefs: rec.evidenceRefs,
              })),
            )
            .onConflictDoNothing();
        }
        console.log(
          `[audit-inline] recommendations: ${recs.length} generated for audit ${auditId}`,
        );
      });
    } catch (recErr) {
      console.error(
        "[audit-inline] recommendation generation failed:",
        recErr instanceof Error ? recErr.message : recErr,
      );
    }
  } catch (err) {
    await serviceDb
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

