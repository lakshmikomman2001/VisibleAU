import { and, desc, eq, ne, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { actionItems, audits, brands, citations, driftAlerts, engineCallFailures } from "@/db/schema";
import type { Tier } from "@/db/schema/enums";
import { subscriptions } from "@/db/schema/subscriptions";
import { pLimit } from "@/lib/audit/concurrency-limit";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { extractCitations, mergeCitedSources } from "@/lib/audit/extract-citations";
import { getAuditPrompts } from "@/lib/audit/get-audit-prompts";
import { type AuditCallOutcome, selectOrganicCitations } from "@/lib/audit/organic-citations";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { buildEngineLocation } from "@/lib/brands/region-label";
import { detectDrift } from "@/lib/drift/detect";
import type { CompositeBasis } from "@/lib/drift/types";
import { getLLMService } from "@/lib/llm";
import type { Engine, MockScenario, ModelTask } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { enginesForTier, PROMPTS_PER_AUDIT, runsForTier } from "@/lib/llm/tier-engines";
import { callWithRetry } from "@/lib/llm/with-retry";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { QualityGateService } from "@/lib/platform/quality-gate.service";
import {
  buildRecommendations,
  gatherRecommendationEvidence,
  productionCheckers,
} from "@/lib/recommendations";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { contextDimensionScore } from "@/lib/scoring/context";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { sentimentDimensionScore } from "@/lib/scoring/sentiment";

/**
 * Vunnara (sample-audit follow-up, 20 Oct): `opts` lets ONE caller --
 * the public sample audit (lib/sample-audit/run.ts) -- override the
 * tier-derived engines/runsPerPrompt and the global PROMPTS_PER_AUDIT,
 * and bound how many (engine, prompt) calls run at once. Omitted
 * (every existing caller), behaviour is byte-identical to before this
 * change: tier-derived engines/runs, the global prompt count, fully
 * unbounded parallelism. Before this, SAMPLE_AUDIT_CONFIG's own
 * engines/promptsCount/runsPerPrompt were declared but never actually
 * wired here -- a sample audit silently ran the free tier's real
 * defaults (2 engines x the global 10-prompt count), not the 1
 * engine x 5 prompts the config object (and the UI's own footer text)
 * claimed.
 */
export interface RunAuditInlineOverrides {
  engines?: readonly Engine[];
  promptsCount?: number;
  runsPerPrompt?: number;
  /** Max (engine, prompt) calls in flight at once. Omitted = unbounded
   * (the pre-existing behaviour) -- see lib/audit/concurrency-limit.ts's
   * own doc comment for why this is a defensive cap, not a speed-up. */
  concurrencyLimit?: number;
  /** Audit reliability, Part C -- an epoch-ms deadline lib/llm/with-
   * retry.ts's one retry respects (never retries if there's no time
   * left for it). Omitted (every caller except the sample-audit
   * deadline wrapper), behaviour is unchanged: no deadline is ever
   * enforced here, same as before this field existed. */
  deadlineAt?: number;
}

export async function runAuditInline(
  auditId: string,
  opts?: RunAuditInlineOverrides,
): Promise<void> {
  const [a] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
  if (!a) throw new Error(`Audit ${auditId} not found`);

  const [b] = await serviceDb.select().from(brands).where(eq(brands.id, a.brandId));
  if (!b) throw new Error(`Brand ${a.brandId} not found`);

  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, a.organizationId));

  const effectiveTier = sub?.tier ?? "free";
  const engines = opts?.engines ? [...opts.engines] : enginesForTier(effectiveTier);
  const runsPerPrompt = opts?.runsPerPrompt ?? runsForTier(effectiveTier);
  const callLimit = pLimit(opts?.concurrencyLimit ?? Infinity);

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
    // Build 1 addendum (entry-point check): the public pre-signup
    // sample audit (lib/sample-audit/run.ts, triggeredBy "sample") is
    // the one caller allowed past the needs-confirmation gate -- its
    // brand is a synthetic, throwaway row with no classification/
    // location by design, never a tracked customer brand.
    const prompts = await getAuditPrompts(b, opts?.promptsCount ?? PROMPTS_PER_AUDIT, {
      allowUnconfirmed: a.triggeredBy === "sample",
    });

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
        (budgetErr.message === "Budget exceeded" ||
          budgetErr.message === "Daily spend cap exceeded")
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
      const callResult = await callWithRetry(
        () =>
          llm.complete({
            engine: engine as Engine,
            prompt: prompts[promptIdx].text,
            task: "brand_mention",
            model,
            location: buildEngineLocation(b),
            metadata: { mockScenario },
          }),
        { deadlineAt: opts?.deadlineAt },
      );

      if (callResult.status === "failure") {
        return { kind: "failure" as const, engine, promptIdx, run, ...callResult };
      }

      const result = callResult.output;
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
        kind: "success" as const,
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

    // Build 1 addendum, item 6 / audit reliability Part A: one engine's
    // failure (now real, retried-once, cost-tracked failures from
    // lib/llm/with-retry.ts, never a bare swallowed throw) must never
    // fail the whole audit, but it must also never be INVISIBLE -- a
    // failed call writes no citation row (so it's already excluded
    // from the organic sample and never counted as "not mentioned"),
    // but a real engine_call_failures row now records why, which
    // prompt, how long it took, and what it cost. engineFailures (the
    // per-engine count persisted into audits.metadata below) is kept
    // alongside it for the audit page's own existing summary.
    const engineFailures: Record<string, number> = {};

    // Vunnara Build 1, Part F.1: one real LLM call per (engine, prompt),
    // always -- the replay loop this used to run `runsPerPrompt` times
    // is gone; runsPerPrompt is now always RUNS_PER_PROMPT (1) via
    // runsForTier, kept as a stored/displayed count, not a loop bound.
    async function runEngine(engine: Engine) {
      const batch = prompts.map((_, i) => callLimit(() => runOneCall(engine, i, 1)));
      const results = await Promise.all(batch);
      for (const r of results) {
        if (r.kind === "failure") {
          console.error(
            `[audit-inline] ${r.engine} prompt=${r.promptIdx} FAILED (${r.errorClass}, ${r.attempts} attempt(s)): ${r.errorMessage}`,
          );
          engineFailures[engine] = (engineFailures[engine] ?? 0) + 1;
          totalCost += r.costUsd;
          await serviceDb.insert(engineCallFailures).values({
            auditId,
            organizationId: a.organizationId,
            engine: r.engine,
            prompt: prompts[r.promptIdx].text,
            isBrandedPrompt: prompts[r.promptIdx].isBranded,
            errorClass: r.errorClass,
            errorMessage: r.errorMessage,
            attempts: r.attempts,
            latencyMs: r.latencyMs,
            costUsd: r.costUsd.toString(),
          });
          continue;
        }
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

    // Vunnara (19 Oct, post-aa83b3a), "the headline is the mention
    // rate": this used to blend all 5 dimensions via
    // compositeVisibilityScore (deleted -- lib/scoring/composite.ts).
    // Production audit #30 showed why that misleads: 6 of 37 mentions
    // (Frequency 16.2) blended into a headline of 56.6, and the blend
    // wasn't even monotonic (1 of 37, ranked first and cited, scored
    // ~62 -- HIGHER). The stored scoreComposite/scoreConfidenceLow/High
    // columns now carry the mention rate itself, not a blend -- chosen
    // over simply stopping the write so every reader that queries these
    // columns directly for HISTORY (never for display/sorting/alerts,
    // per this fix) still sees an honest number, and so no migration is
    // needed to drop them.
    const headline = freqScore;

    // Per-dimension 95% CIs. Task SSS: the LLM cache key has no run index
    // (sha256(prompt + model) only), so 4 of every 5 "runs" replay the
    // exact cached response from run 1 -- not independent trials. Feed the
    // interval the TRUE sample size (distinct runNumber===1 observations),
    // not the replay-inflated totalCalls/mentionRows -- otherwise the
    // margin is ~sqrt(5) narrower than the evidence supports. The scores
    // above (freqScore, headline, etc.) are untouched by this and stay
    // byte-identical: every replay is identical to its run-1 original, so
    // the proportion is the same either way.
    const cis = computeDimensionCIs({
      freqScore,
      posScore,
      sentScore,
      ctxScore,
      accScore,
      mentionedCount: organic.distinctMentionedCount,
      totalCalls: organic.distinctSampleCount,
      mentionRowCount: organic.distinctMentionedCount,
      accWithSourcesCount: organic.distinctAccWithSourcesCount,
    });

    await serviceDb
      .update(audits)
      .set({
        status: "complete",
        scoreComposite: headline.toFixed(2),
        scoreFrequency: freqScore.toFixed(2),
        scorePosition: posScore.toFixed(2),
        scoreSentiment: organic.sentiments.length > 0 ? organic.sentiments[0] : "neutral",
        scoreSentimentNumeric: sentScore.toFixed(2),
        scoreContext: organic.contexts.length > 0 ? organic.contexts[0] : "absent",
        scoreContextNumeric: ctxScore.toFixed(2),
        scoreAccuracy: accScore.toFixed(2),
        scoreConfidenceLow: cis.headline.lower.toFixed(2),
        scoreConfidenceHigh: cis.headline.upper.toFixed(2),
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

        // Vunnara (19 Oct, post-aa83b3a): the composite basis
        // ("frequency_only" vs "weighted") was only ever about whether
        // the OLD blend had extra dimensions to mix in -- with the
        // headline now always equal to Frequency alone, there is only
        // ever one basis, so the mismatch-gating in lib/drift/detect.ts
        // is permanently inert (never true) rather than removed outright
        // (lower-risk than reworking that gate, and harmless either way).
        const currentCompositeBasis: CompositeBasis = "frequency_only";
        const previousCompositeBasis: CompositeBasis = "frequency_only";
        const WIDE_CI = { lower: 0, upper: 100 };
        // previousCIs.headline is the current field name; previousCIs.composite
        // is the pre-fix name a previous audit's confidenceIntervals jsonb may
        // still carry (written before this change) -- read either.
        const previousHeadlineCI = previousCIs.headline ?? previousCIs.composite ?? WIDE_CI;

        const driftResult = detectDrift({
          currentScores,
          previousScores,
          currentCIs: cis as unknown as Record<string, { lower: number; upper: number }>,
          previousCIs,
          currentComposite: headline,
          previousComposite: Number(previous.scoreComposite ?? 0),
          currentCompositeBasis,
          previousCompositeBasis,
          currentCompositeCI: cis.headline,
          previousCompositeCI: previousHeadlineCI,
        });

        console.log(
          `[audit-inline] drift check: current=${headline.toFixed(1)} previous=${Number(previous.scoreComposite ?? 0).toFixed(1)} delta=${driftResult.scoreDelta.toFixed(1)} severity=${driftResult.compositeSeverity} significant=${driftResult.hasSignificant}`,
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
        { brandId: a.brandId, brandName: b.name, auditId, region: b.region, categories: b.categories },
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
            scoreComposite: headline.toFixed(2),
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
                // Vunnara (21 Oct, hotfix: recommendations state
                // unverified facts) -- this was missing here (present in
                // inngest/functions/generate-recommendations.ts's own
                // insert, line ~117), a confirmed drift between the two
                // recommendation-writing paths. Without it, every
                // recommendation generated through THIS runner (which
                // app/api/audits/route.ts's real "Run Audit" action uses,
                // not just the sample-audit path) stored confidence_basis
                // = NULL regardless of whether a real checker ran --
                // indistinguishable, by that column alone, from a
                // genuinely legacy pre-evidence row (lib/recommendations/
                // confidence-labels.ts's isLegacyConfidence). The
                // in-memory confidenceLabel ("confirmed") was already
                // correct; only the DB-persisted basis was silently lost.
                confidenceBasis: rec.confidenceBasis,
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
        // Build 1 follow-up (entry-point check): errorCode is a stable
        // machine-checkable marker (Error.name, e.g.
        // "BrandNeedsConfirmationError") alongside the human-readable
        // message -- so a downstream reader (the CI export route) can
        // tell "this audit was skipped, not genuinely failed" apart
        // from a real failure without parsing free-text error prose.
        metadata: {
          error: err instanceof Error ? err.message : String(err),
          errorCode: err instanceof Error ? err.name : undefined,
        },
      })
      .where(eq(audits.id, auditId))
      .catch(() => {});
  }
}
