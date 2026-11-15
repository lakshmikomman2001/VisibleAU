import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations, driftAlerts, engineCallFailures } from "@/db/schema";
import type { Tier } from "@/db/schema/enums";
import { answerMention } from "@/lib/audit/answer-mention";
import { resolveCacheMode } from "@/lib/audit/cache-mode";
import { addCost, EMPTY_COST_TALLY, unpricedReserve } from "@/lib/audit/compute-cost";
import { ENGINE_CALL_CONCURRENCY, pLimit } from "@/lib/audit/concurrency-limit";
import { describeEngineFailure, statusCodeFromMessage } from "@/lib/audit/engine-failure";
import { sendAuditComplete } from "@/lib/audit/audit-complete";
import { sendEngineTotalFailureAlert } from "@/lib/audit/engine-total-failure-alert";
import { extractCitations, mergeCitedSources } from "@/lib/audit/extract-citations";
import { getAuditPrompts } from "@/lib/audit/get-audit-prompts";
import {
  dispatchGoogleSurfacesInline,
  startGoogleSurfaces,
} from "@/lib/audit/google-surfaces/dispatch";
import { auditsCountingGoogle } from "@/lib/audit/google-surfaces/summary";
import { auditModels } from "@/lib/audit/model-drift";
import { sendModelDriftAlert } from "@/lib/audit/model-drift-alert";
import { type AuditCallOutcome, selectOrganicCitations } from "@/lib/audit/organic-citations";
import { questionSetHashSql } from "@/lib/audit/question-set-sql";
import { RESPONSE_SNIPPET_CHARS } from "@/lib/audit/response-snippet";
import { recordCostForTerminalAudit } from "@/lib/audit/stale-audit-guard";
import { includedInTrends } from "@/lib/audit/trend-exclusion-sql";
import { buildEngineLocation } from "@/lib/brands/region-label";
import { driftBaseline } from "@/lib/drift/baseline";
import { buildDriftInput } from "@/lib/drift/build-input";
import { detectDrift } from "@/lib/drift/detect";
import { getLLMService } from "@/lib/llm";
import type { Engine, MockScenario, ModelTask } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { enginesForTier, PROMPTS_PER_AUDIT, runsForTier } from "@/lib/llm/tier-engines";
import { callWithRetry } from "@/lib/llm/with-retry";
import {
  BudgetPolicyService,
  DailySpendCapExceededError,
} from "@/lib/platform/budget-policy.service";
import { QualityGateService } from "@/lib/platform/quality-gate.service";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import {
  buildRecommendations,
  gatherRecommendationEvidence,
  productionCheckers,
} from "@/lib/recommendations";
import { persistRecommendations } from "@/lib/recommendations/persist";
import { contextDimensionScore } from "@/lib/scoring/context";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";
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

  const planTier = await effectiveTier(serviceDb, a.organizationId);
  const engines = opts?.engines ? [...opts.engines] : enginesForTier(planTier);
  const runsPerPrompt = opts?.runsPerPrompt ?? runsForTier(planTier);
  // "'Run audit' always fetches fresh answers", item 1 -- decided ONCE
  // here, before any call, same as inngest/functions/run-audit.ts's
  // matching "load-audit" step.
  const cacheMode = await resolveCacheMode(a);
  // Google AI surfaces (Phase 1): decided once, here. Null -- and nothing read or written -- with the env
  // switch off (lib/audit/google-surfaces/dispatch.ts).
  const google = await startGoogleSurfaces({ audit: a, brand: b, tier: planTier });
  // "Audits time out on Vercel" follow-up, item 4 -- when a caller
  // passes an explicit concurrencyLimit (today: only the sample-audit
  // deadline wrapper, SAMPLE_AUDIT_CONFIG.concurrencyLimit = 6), that
  // stays a single limiter SHARED across every engine, byte-identical
  // to before this change. Every other (real-audit) caller now gets
  // the SAME per-engine shape inngest/functions/run-audit.ts uses
  // instead of the old unbounded default -- see runEngine() below,
  // which creates its own fresh pLimit(ENGINE_CALL_CONCURRENCY) per
  // engine in that case, never one shared across all four.
  const sharedCallLimit =
    opts?.concurrencyLimit !== undefined ? pLimit(opts.concurrencyLimit) : null;

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
        const capErr = new DailySpendCapExceededError(dailySpend);
        // The amounts for the operator's log only; the audit stores the customer message.
        console.warn(`[audit-inline] audit ${auditId}: ${capErr.operatorDetail}`);
        throw capErr;
      }
    } catch (budgetErr) {
      if (
        budgetErr instanceof DailySpendCapExceededError ||
        (budgetErr instanceof Error && budgetErr.message === "Budget exceeded")
      ) {
        throw budgetErr;
      }
      console.error("[audit-inline] budget estimate failed (non-fatal):", budgetErr);
    }

    let costTally = EMPTY_COST_TALLY;
    const callOutcomes: AuditCallOutcome[] = [];

    const tier = planTier as Tier;
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
            cacheMode,
            metadata: { mockScenario },
            // Audit reliability, Part C, item 1: lets a slow call still
            // in flight when the deadline hits actually abort then,
            // rather than only stopping a RETRY from starting (the
            // deadlineAt passed to callWithRetry below does that part).
            deadlineAt: opts?.deadlineAt,
          }),
        { deadlineAt: opts?.deadlineAt },
      );

      if (callResult.status === "failure") {
        return { kind: "failure" as const, engine, promptIdx, run, ...callResult };
      }

      const result = callResult.output;
      // Task #43: Perplexity's real cited sources arrive as structured
      // URLs (result.citedUrls), not necessarily in the response text --
      // merge both. For engines without structured sources, citedUrls is
      // undefined and this is a no-op (extractCitations' result alone).
      const sources = mergeCitedSources(extractCitations(result.response), result.citedUrls);
      // 13 Nov: the one mention check, the same as Google's (lib/audit/answer-mention.ts). Verification is
      // null when the name wasn't found, "unverified" when it was but isn't confirmed as this business.
      const { mention, verification: mentionVerification } = await answerMention({
        text: result.response,
        sources,
        brand: b,
      });
      const sentimentLabel = mention.found ? "positive" : "neutral";
      const contextLabel = mention.found ? "listed" : "absent";

      // "Audits time out on Vercel" follow-up, item 4 -- see the
      // matching engine_call_failures insert's own comment above.
      await serviceDb
        .insert(citations)
        .values({
          auditId,
          engine,
          prompt: prompts[promptIdx].text,
          promptIndex: promptIdx,
          isBrandedPrompt: prompts[promptIdx].isBranded,
          runNumber: run,
          brandMentioned: mention.found,
          position: mention.position,
          mentionVerification,
          sentimentLabel,
          contextLabel,
          responseSnippet: result.response.slice(0, RESPONSE_SNIPPET_CHARS),
          // Task #46 Phase 3, Part B: the full answer, permanently. On a
          // cache hit result.response is already the full cached text
          // (lib/llm/cache.ts getCached() returns llm_response_cache.response
          // untruncated), so no special-casing is needed.
          responseText: result.response,
          citedSources: sources,
          llmCostUsd: result.costEstimateUsd === null ? null : result.costEstimateUsd.toString(),
          llmCostSource: result.costSource ?? null,
          // "Mention detection" (6 Nov), part 2: why the provider stopped, and whether the answer
          // was cut off at the length limit (NULL for a cache hit, which made no call).
          stopReason: result.stopReason ?? null,
          answerTruncated: result.truncated ?? null,
          llmTokensUsed: result.tokensUsed,
          // Methodology v2.2 (7 Nov), part 7: as the provider reported them; NULL when it didn't.
          llmInputTokens: result.inputTokens ?? null,
          llmOutputTokens: result.outputTokens ?? null,
          llmModel: result.model,
          // Sri's decision 6 (7 Nov): the model the provider said answered (lib/llm/model-drift.ts).
          llmModelAnswered: result.modelAnswered ?? null,
          isCacheHit: result.isCacheHit,
          cachedFromAt: result.cachedFromAt ?? null,
        })
        .onConflictDoNothing({
          target: [citations.auditId, citations.engine, citations.promptIndex],
        });

      return {
        kind: "success" as const,
        found: mention.found,
        position: mention.position,
        mentionVerification,
        sentimentLabel,
        contextLabel,
        sources,
        cost: result.costEstimateUsd,
        capReserveUsd: result.capReserveUsd ?? 0,
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
      // A fresh limiter per engine when there's no explicit shared
      // one -- see sharedCallLimit's own doc comment above.
      const callLimit = sharedCallLimit ?? pLimit(ENGINE_CALL_CONCURRENCY);
      const batch = prompts.map((_, i) => callLimit(() => runOneCall(engine, i, 1)));
      const results = await Promise.all(batch);
      for (const r of results) {
        if (r.kind === "failure") {
          // URGENT audit #37 (31 Oct): the class, the code and a plain
          // reason -- never the provider's raw message, which can carry a
          // masked key or an account id.
          console.error(
            `[audit-inline] ${r.engine} prompt=${r.promptIdx} FAILED (${r.errorClass}, ${r.attempts} attempt(s), status ${statusCodeFromMessage(r.errorMessage) ?? "none"}): ${describeEngineFailure({ errorClass: r.errorClass, message: r.errorMessage }).label}`,
          );
          engineFailures[engine] = (engineFailures[engine] ?? 0) + 1;
          costTally = addCost(costTally, r.costUsd, r.capReserveUsd);
          // "Audits time out on Vercel" follow-up, item 4 -- same
          // promptIndex + ON CONFLICT DO NOTHING as inngest/functions/
          // run-audit.ts (migration 0093's unique index), for schema
          // consistency between both runners -- this function has no
          // Inngest-style step-replay risk of its own (it's one
          // continuous execution, not resumed across requests), but a
          // future caller invoking it twice for the same auditId
          // (a bug, not a supported use) would otherwise still be
          // able to double a row here.
          await serviceDb
            .insert(engineCallFailures)
            .values({
              auditId,
              organizationId: a.organizationId,
              engine: r.engine,
              prompt: prompts[r.promptIdx].text,
              promptIndex: r.promptIdx,
              isBrandedPrompt: prompts[r.promptIdx].isBranded,
              errorClass: r.errorClass,
              errorMessage: r.errorMessage,
              attempts: r.attempts,
              latencyMs: r.latencyMs,
              // Migration 0127 (methodology v2.2, part 4): NULL when unknown -- a call that timed
              // out, or a model with no price -- never a guessed 0.
              costUsd: r.costUsd === null ? null : r.costUsd.toString(),
              costSource: r.costSource ?? null,
            })
            .onConflictDoNothing({
              target: [
                engineCallFailures.auditId,
                engineCallFailures.engine,
                engineCallFailures.promptIndex,
              ],
            });
          continue;
        }
        costTally = addCost(costTally, r.cost, r.capReserveUsd);
        callOutcomes.push({
          isBranded: r.isBranded,
          brandMentioned: r.found,
          position: r.position,
          mentionVerification: r.mentionVerification,
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

    // Audit #36 follow-up: no Position or Source-citation score -- both
    // are counts now, read back from the stored citations
    // (resolveOrganicDimensions), and audits.score_position /
    // score_accuracy are no longer written.
    const freqScore = frequencyDimensionScore(organic.mentionedCount, organic.totalCalls);

    const sentScore = sentimentDimensionScore(
      organic.sentiments as Parameters<typeof sentimentDimensionScore>[0],
    );
    const ctxScore = contextDimensionScore(
      organic.contexts as Parameters<typeof contextDimensionScore>[0],
    );

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
      sentScore,
      ctxScore,
      mentionedCount: organic.distinctMentionedCount,
      totalCalls: organic.distinctSampleCount,
      mentionRowCount: organic.distinctMentionedCount,
    });

    const [finalized] = await serviceDb
      .update(audits)
      .set({
        status: "complete",
        scoreComposite: headline.toFixed(2),
        scoreFrequency: freqScore.toFixed(2),
        scoreSentiment: organic.sentiments.length > 0 ? organic.sentiments[0] : "neutral",
        scoreSentimentNumeric: sentScore.toFixed(2),
        scoreContext: organic.contexts.length > 0 ? organic.contexts[0] : "absent",
        scoreContextNumeric: ctxScore.toFixed(2),
        scoreConfidenceLow: cis.headline.lower.toFixed(2),
        scoreConfidenceHigh: cis.headline.upper.toFixed(2),
        confidenceIntervals: cis,
        totalCostUsd: costTally.knownUsd.toFixed(4),
        engines: engines as string[],
        engineCount: engines.length,
        promptsCount: prompts.length,
        runsPerPrompt,
        totalCalls,
        completedAt: new Date(),
        // 15 Nov, part 2: the everyday questions it asked, from its stored rows (migration 0150).
        questionSetHash: questionSetHashSql(auditId),
        // Build 1 addendum, item 6: merged, never overwritten --
        // metadata already carries mockScenario (set at audit-creation
        // time) and must keep it.
        ...(Object.keys(engineFailures).length > 0
          ? { metadata: sql`metadata || ${JSON.stringify({ engineFailures })}::jsonb` }
          : {}),
      })
      // Reliability follow-up, item 3: the stale-run guard
      // (lib/audit/stale-audit-guard.ts) could have flipped this
      // SAME audit to "failed" while this run was busy scoring (rare
      // -- it requires the full inactivity window with no row
      // written, which this run itself was just about to end by
      // writing one) -- requiring a non-terminal status here means
      // that race loses cleanly: this UPDATE matches zero rows
      // instead of overwriting "failed" back to "complete".
      .where(and(eq(audits.id, auditId), inArray(audits.status, ["pending", "running"])))
      .returning({ id: audits.id, questionSetHash: audits.questionSetHash });

    if (!finalized) {
      // Stale-run guard follow-up, item 3 -- the money was still
      // actually spent even though the stale guard won this race, so
      // it's still recorded (both the audits.total_cost_usd column
      // and the audit_cost_snapshots row the daily spend cap reads
      // back) -- only the SCORING-dependent steps below are skipped,
      // since there's no live, non-terminal audit left to attach a
      // quality gate, a drift alert, a recommendation or a
      // completion email to.
      await recordCostForTerminalAudit(auditId, costTally);
      console.warn(
        `[audit-inline] audit ${auditId} was already in a terminal status when finalization tried to run (stale-run guard?) -- recorded the $${costTally.knownUsd.toFixed(4)} actually spent, but skipping quality gates, drift and recommendations`,
      );
      return;
    }

    // Phase 2: post-scoring — record cost snapshot and evaluate quality gates
    const capReserve = unpricedReserve(costTally);
    try {
      await BudgetPolicyService.record(auditId, costTally.knownUsd, "audit", capReserve);
    } catch (recordErr) {
      console.error("[audit-inline] cost snapshot record failed (non-fatal):", recordErr);
    }
    try {
      await QualityGateService.evaluate(auditId);
    } catch (qgErr) {
      console.error("[audit-inline] quality gate evaluation failed (non-fatal):", qgErr);
    }

    // Leftovers task, part 2 (17 Nov): finished the way an audit started by hand finishes
    // (inngest/functions/run-audit.ts): Google, when a surface was on, then audit.complete -- which every follow-up
    // listens for (lib/audit/audit-complete.ts). This runner sent none, so a scheduled, bulk, workflow or validation
    // audit got no completion email, no weekly trend (so no narrative report, PDF or scheduled report email), no
    // topical gaps, citation sources, evidence snapshot, hallucination check, GA4 push, head-to-head comparisons or
    // webhooks -- only the inline copies of drift, recommendations and the two alerts below. Those now run only when
    // Inngest can't be reached (the manual route's fallback, app/api/audits/route.ts, when its own send failed).
    //
    // The public sample audit (a throwaway brand in the sample workspace, triggeredBy "sample") has no follow-ups:
    // nobody receives its email or report, and nothing shows its recommendations or drift.
    if (a.triggeredBy === "sample") return;
    const finishedAudit = { id: auditId, brandId: a.brandId, organizationId: a.organizationId };
    // Google AI surfaces (Phase 1): when a surface was on at the start, the questions go to
    // inngest/functions/collect-google-surfaces.ts, which sends audit.complete when Google is done (as for an
    // audit started by hand). Never throws.
    if (google && (await dispatchGoogleSurfacesInline(finishedAudit, prompts))) return;
    if (await sendAuditComplete(finishedAudit)) return;

    // Inngest couldn't be reached: what can run here, does. URGENT audit #37 (31 Oct), item 2: the same alert the
    // Inngest path sends (inngest/functions/notify-engine-total-failure.ts) when a whole engine failed.
    const totalFailureEngines = engines.filter(
      (engine) => (engineFailures[engine] ?? 0) >= prompts.length && prompts.length > 0,
    );
    if (totalFailureEngines.length > 0) {
      try {
        await sendEngineTotalFailureAlert(auditId);
      } catch (alertErr) {
        console.error(
          "[audit-inline] engine total-failure alert failed (non-fatal):",
          alertErr instanceof Error ? alertErr.name : "unknown",
        );
      }
    }
    // Sri's decision 6 (7 Nov): the same for an engine that answered with a different model
    // (inngest/functions/notify-model-drift.ts on the Inngest path).
    try {
      await sendModelDriftAlert(auditId);
    } catch (alertErr) {
      console.error(
        "[audit-inline] model drift alert failed (non-fatal):",
        alertErr instanceof Error ? alertErr.name : "unknown",
      );
    }

    // Drift detection — compare with previous audit for same brand
    try {
      await withRlsContext(a.organizationId, async (tx) => {
        // URGENT audit #37 (31 Oct), item 2: never compared when a whole
        // engine failed, and never against an earlier audit that lost one
        // (inngest/functions/detect-drift.ts's same rule).
        if (totalFailureEngines.length > 0) {
          console.log("[audit-inline] drift check: skipped — a whole engine failed in this audit");
          return;
        }
        const candidates = await tx
          .select()
          .from(audits)
          .where(
            and(
              eq(audits.brandId, a.brandId),
              ne(audits.id, auditId),
              eq(audits.status, "complete"),
              // 14 Nov, part 5: never against an audit an operator excluded from trends.
              includedInTrends,
            ),
          )
          .orderBy(desc(audits.createdAt))
          .limit(10);
        // "Mention detection" (6 Nov), part 6: and only under the same methodology; methodology v2.2 (7 Nov),
        // part 3: with the same models, and never an audit answered by another model (lib/drift/baseline.ts).
        const models = await auditModels(tx, [auditId, ...candidates.map((c) => c.id)]);
        // Google AI surfaces (Phase 1): never against an audit that counted Google differently.
        const countsGoogle = await auditsCountingGoogle(tx, [
          auditId,
          ...candidates.map((c) => c.id),
        ]);
        // 15 Nov, part 2: `a` was loaded before the audit ran; its question set is the one just written.
        const baseline = driftBaseline(
          { ...a, questionSetHash: finalized.questionSetHash },
          candidates,
          models,
          countsGoogle,
        );
        const previous = baseline.previous;

        if (!previous) {
          console.log(
            {
              methodology_changed:
                "[audit-inline] drift check: skipped — no earlier audit under the same methodology",
              questions_changed:
                "[audit-inline] drift check: skipped — no earlier audit with the same everyday questions",
              models_changed:
                "[audit-inline] drift check: skipped — no earlier audit with the same models",
              model_drift:
                "[audit-inline] drift check: skipped — a provider answered with a different model",
              first_audit_no_comparison:
                "[audit-inline] drift check: skipped — no previous completed audit for this brand",
            }[baseline.reason],
          );
          return;
        }

        // 17 Nov, part 3: the same comparison as inngest/functions/detect-drift.ts -- both audits resolved from their
        // answers (buildDriftInput -> resolveAuditForDrift). It compared this run's own scores with the previous
        // audit's STORED columns, filling a missing one with a default (frequency ?? 50, headline ?? 0) and adding
        // sentiment and context, which have no classifier behind them: an alert could rest on made-up numbers.
        const driftResult = detectDrift(
          await buildDriftInput(tx, { ...a, questionSetHash: finalized.questionSetHash }, previous),
        );

        console.log(
          `[audit-inline] drift check: delta=${driftResult.scoreDelta.toFixed(1)} severity=${driftResult.compositeSeverity} significant=${driftResult.hasSignificant}`,
        );

        if (driftResult.hasSignificant) {
          await tx.insert(driftAlerts).values({
            organizationId: a.organizationId,
            brandId: a.brandId,
            currentAuditId: auditId,
            previousAuditId: previous.id,
            severity: driftResult.compositeSeverity,
            // As detect-drift.ts stores it: no numeric delta across a basis or question-set mismatch.
            scoreDelta:
              driftResult.compositeBasisMismatch || driftResult.promptPackVersionMismatch
                ? null
                : String(driftResult.scoreDelta),
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
        {
          brandId: a.brandId,
          brandName: b.name,
          auditId,
          region: b.region,
          categories: b.categories,
        },
        productionCheckers(serviceDb),
      );
      await withRlsContext(a.organizationId, async (tx) => {
        // The same counts the audit page shows, read back from the rows
        // this run just wrote.
        const counts = await resolveAuditDimensionsAndHeadline(tx, auditId);
        const recs = await buildRecommendations(
          {
            scoreFrequency: freqScore.toFixed(2),
            scoreSentimentNumeric: sentScore.toFixed(2),
            scoreContextNumeric: ctxScore.toFixed(2),
            scoreComposite: headline.toFixed(2),
            confidenceIntervals: cis,
            vertical: b.vertical,
            categories: b.categories,
            mentionDetail: {
              mentionedCount: counts.mentionedCount,
              rankedCount: counts.rankedCount,
              medianPosition: counts.medianPosition,
              sourcedCount: counts.sourcedCount,
            },
          },
          tx,
          evidence,
        );

        // "The Action Center shows each brand's latest audit only" (23
        // Oct), item 1 -- same shared helper the Inngest function calls
        // (inngest/functions/generate-recommendations.ts), so the
        // dismiss-old-opens / skip-if-in-progress rules can't drift
        // between the two runners again, the way confidenceBasis itself
        // once did (see the removed comment this replaced). Runs even
        // when recs.length === 0: this audit is still the brand's
        // latest complete one, so older open items are superseded
        // either way.
        const persistResult = await persistRecommendations(tx, {
          auditId,
          organizationId: a.organizationId,
          brandId: a.brandId,
          recommendations: recs,
        });
        console.log(
          `[audit-inline] recommendations: ${recs.length} generated, ${persistResult.inserted} inserted, ${persistResult.skippedInProgressKeys.length} skipped (in progress), ${persistResult.dismissed} dismissed for audit ${auditId}`,
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
