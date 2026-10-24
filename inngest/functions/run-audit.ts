import { and, eq, inArray, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, citations, engineCallFailures } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { extractCitations, mergeCitedSources } from "@/lib/audit/extract-citations";
import {
  BrandNeedsConfirmationError,
  getAuditPrompts,
  PromptPackGenerationError,
} from "@/lib/audit/get-audit-prompts";
import { resolveCacheMode } from "@/lib/audit/cache-mode";
import { addCost, EMPTY_COST_TALLY, unpricedReserve } from "@/lib/audit/compute-cost";
import { deriveEngineCallConcurrency, pLimit } from "@/lib/audit/concurrency-limit";
import { type AuditCallOutcome, selectOrganicCitations } from "@/lib/audit/organic-citations";
import { recordCostForTerminalAudit } from "@/lib/audit/stale-audit-guard";
import { verifyMention } from "@/lib/audit/verify-mention";
import { buildEngineLocation } from "@/lib/brands/region-label";
import { inngest } from "@/lib/inngest/client";
import { getLLMService } from "@/lib/llm";
import type { Engine, MockScenario } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { INNGEST_STEP_BUDGET_MS } from "@/lib/llm/step-budget";
import { enginesForTier, PROMPTS_PER_AUDIT, runsForTier } from "@/lib/llm/tier-engines";
import { callWithRetry } from "@/lib/llm/with-retry";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { QualityGateService } from "@/lib/platform/quality-gate.service";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { contextDimensionScore } from "@/lib/scoring/context";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { sentimentDimensionScore } from "@/lib/scoring/sentiment";

// "Inngest: fit within the 5 concurrent steps of the free plan", item
// 1 -- the largest tier's own engine count today (lib/llm/tier-
// engines.ts's TIER_ENGINES: growth/agency/enterprise all run 4).
// Used only to size the STATIC function-level concurrency limit
// below, which Inngest needs at registration time, not per-run --
// the ACTUAL per-engine limit each run computes for itself
// (deriveEngineCallConcurrency(engines.length) below) already
// adapts correctly to a smaller (e.g. free-tier, 2-engine) audit.
const MAX_ENGINES_PER_AUDIT = 4;

export const runAudit = inngest.createFunction(
  {
    id: "run-audit",
    retries: 2,
    // "Inngest: fit within the 5 concurrent steps of the free plan",
    // item 1 -- keyed by organizationId, scope "fn" (the default: only
    // run-audit's own runs count), so one org running several audits
    // at once (a manual click right after a scheduled one, a bulk
    // re-audit) can never claim more call steps than ONE audit was
    // already budgeted to use -- deriveEngineCallConcurrency(
    // MAX_ENGINES_PER_AUDIT) * MAX_ENGINES_PER_AUDIT, the same total a
    // single 4-engine audit computes for itself when the account is at
    // its Hobby-plan default (5 slots, 1 per engine -> 4 total). A
    // DIFFERENT org's audits are a separate key entirely, so they're
    // never held back by this org's own backlog.
    concurrency: {
      limit: deriveEngineCallConcurrency(MAX_ENGINES_PER_AUDIT) * MAX_ENGINES_PER_AUDIT,
      key: "event.data.organizationId",
    },
    triggers: [{ event: "audit.run" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { auditId: string; organizationId?: string } };
    step: any;
  }) => {
    const { auditId } = event.data;

    try {
      const loaded = await step.run("load-audit", async () => {
        const [a] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
        const [b] = await serviceDb.select().from(brands).where(eq(brands.id, a.brandId));
        const [sub] = await serviceDb
          .select({ tier: subscriptions.tier })
          .from(subscriptions)
          .where(eq(subscriptions.organizationId, a.organizationId));

        const engines = enginesForTier(sub?.tier ?? "free");
        const rpp = runsForTier(sub?.tier ?? "free");
        if (engines.length === 0) {
          throw new Error(`Audit ${auditId}: resolved 0 engines for tier "${sub?.tier ?? "free"}"`);
        }

        await serviceDb
          .update(audits)
          .set({
            status: "running",
            startedAt: new Date(),
            engines: engines as Engine[],
            engineCount: engines.length,
          })
          .where(eq(audits.id, auditId));

        // "'Run audit' always fetches fresh answers", item 1 -- decided
        // ONCE here, inside this memoized step: an Inngest function-
        // level retry replays this step's own result rather than
        // recomputing it, so the mode can't drift mid-audit.
        const cacheMode = await resolveCacheMode(a);

        return {
          audit: a,
          brand: b,
          engines: [...engines],
          runsPerPrompt: rpp,
          tier: (sub?.tier ?? "free") as string,
          cacheMode,
        };
      });

      // Vunnara Build 1, Part E.5: the ONE prompt-selection function
      // shared with lib/audit/run-audit-inline.ts -- this used to be
      // its own inline copy with its own hardcoded promptCount=10 and
      // its own re-slice of a frozen pack (silently dropping Part
      // E.4's branded extras, appended after the organic budget).
      const pack = await step.run("load-pack", async () => {
        const prompts = await getAuditPrompts(loaded.brand, PROMPTS_PER_AUDIT);
        return { prompts };
      });

      const { prompts } = pack;
      if (prompts.length === 0) {
        await step.run("fail-empty", async () => {
          await serviceDb
            .update(audits)
            .set({
              status: "failed",
              failedAt: new Date(),
              metadata: sql`metadata || '{"error":"0 prompts."}'::jsonb`,
            })
            .where(eq(audits.id, auditId));
        });
        return { auditId, error: "empty_pack_prompts" };
      }

      const { engines, runsPerPrompt } = loaded;

      // "The Running audit page shows made-up numbers" (23 Oct), item 1
      // -- this used to be written ONLY in "finalize" below, at
      // completion, which meant promptsCount/totalCalls stayed NULL for
      // this audit's ENTIRE run: the progress page's own ec/pc/rc
      // fallback literals (app/(auth)/audits/[auditId]/page.tsx) and
      // the per-engine "total" (app/api/audits/[auditId]/route.ts's
      // perEngineTotal) both read promptsCount, so a still-running
      // audit always showed the wrong guessed numbers, never the real
      // ones, however long it ran. lib/audit/run-audit-inline.ts
      // already writes this right after its own equivalent of
      // load-pack resolves; this brings the Inngest path in line with
      // it rather than leaving the two runners' timing to drift.
      await step.run("record-prompt-count", async () => {
        await serviceDb
          .update(audits)
          .set({
            promptsCount: prompts.length,
            runsPerPrompt,
            totalCalls: engines.length * prompts.length * runsPerPrompt,
          })
          .where(eq(audits.id, auditId));
      });
      let costTally = EMPTY_COST_TALLY;
      const callOutcomes: AuditCallOutcome[] = [];
      // Build 1 addendum, item 6: see lib/audit/run-audit-inline.ts's
      // matching comment -- a failed call already writes no citation
      // row (excluded from the organic sample, never counted as "not
      // mentioned"), but until now nothing recorded that it happened.
      const engineFailures: Record<string, number> = {};

      // "Audits time out on Vercel" follow-up, item 3 -- one call per
      // Inngest step (item 2) makes running them concurrently safe:
      // each is independently memoized and retried by its own
      // deterministic id, so fanning several out at once with
      // Promise.all (Inngest's own documented "parallel steps"
      // pattern -- create every step.run() call without awaiting it
      // individually, then await them together) is exactly as safe
      // as running them one at a time, just faster. The 4 engines run
      // fully concurrently with each other; WITHIN one engine,
      // ENGINE_CALL_CONCURRENCY (lib/audit/concurrency-limit.ts) caps
      // how many of its own calls are in flight at once -- a
      // SEPARATE pLimit instance per engine, never one shared across
      // all four, so one slow or rate-limited engine's own queue can
      // never starve the other three's concurrency budget.
      async function runOneCall(engine: Engine, i: number) {
        // "Audits time out on Vercel" follow-up, item 2 -- one
        // provider call AND its own write (citation, or failure
        // with its cost) live inside this ONE step, with a
        // deterministic id -- a retry of just this step (Inngest's
        // own `retries`, or a replay after the Vercel request
        // running it was killed) can never repeat an already-
        // written call's DB write, because the ON CONFLICT below
        // targets the unique (audit_id, engine, prompt_index) index
        // (migration 0093). The deadline passed to callWithRetry
        // (and to the call itself, so an in-flight attempt aborts
        // too, not just a retry) is computed fresh, HERE, at the
        // start of THIS step -- never inherited from the overall
        // audit or a prior step -- so this one step's own total
        // time (every attempt, every backoff) stays inside
        // INNGEST_STEP_BUDGET_MS, well under the 300s Vercel
        // function limit this route is configured for (vercel.
        // json). If a retry wouldn't fit before the deadline,
        // callWithRetry's own existing deadline check (lib/llm/
        // with-retry.ts) stops retrying and returns the failure as
        // -is, with whatever cost was actually billed across the
        // attempts already made -- recorded by THIS step before it
        // returns, never handed off to a separate step or a
        // step.sleep: the call's own per-attempt timeout (lib/llm/
        // web-search-config.ts's ENGINE_CALL_TIMEOUT_MS -- 30s for
        // every engine except Claude's 75s) is already short enough
        // that even Claude's worst case -- one timeout plus its one
        // allowed retry (with-retry.ts's MAX_RETRIES_BY_CLASS.timeout),
        // ~150s plus backoff -- plus this step's own DB write finishes
        // comfortably inside the 290s budget, so there's no scenario
        // where the step itself would need more room than that to
        // finish safely.
        return step.run(`call:${engine}:${i}`, async () => {
            const deadlineAt = Date.now() + INNGEST_STEP_BUDGET_MS;
            const llm = getLLMService(engine as Engine);
            const model = selectModel(
              loaded.tier as Parameters<typeof selectModel>[0],
              engine as Engine,
              "brand_mention",
            );
            const callResult = await callWithRetry(
              () =>
                llm.complete({
                  engine: engine as Engine,
                  prompt: prompts[i].text,
                  task: "brand_mention",
                  model,
                  location: buildEngineLocation(loaded.brand),
                  cacheMode: loaded.cacheMode,
                  metadata: {
                    mockScenario: (
                      loaded.audit.metadata as { mockScenario?: MockScenario } | null
                    )?.mockScenario,
                  },
                  deadlineAt,
                }),
              { deadlineAt },
            );

            if (callResult.status === "failure") {
              // "Audits time out on Vercel" follow-up, item 2 -- the
              // ON CONFLICT target is migration 0093's unique
              // (audit_id, engine, prompt_index) index: a replay
              // landing on a conflict means a PRIOR attempt of this
              // exact step already wrote a real row before dying, so
              // this INSERT is correctly a no-op -- never read back
              // from the table afterwards (lib/scoring/resolve-audit-
              // dimensions.ts's own rule: a stored column is never
              // trusted as a read source, even one this same call
              // just wrote). This attempt's own callResult is used
              // for the return value either way; on a real conflict
              // it may differ slightly from whatever the winning
              // attempt stored (e.g. a different attempts/latencyMs),
              // which is fine -- only the DB row's uniqueness matters,
              // never byte-identical aggregation across attempts.
              await serviceDb
                .insert(engineCallFailures)
                .values({
                  auditId,
                  organizationId: loaded.audit.organizationId,
                  engine,
                  prompt: prompts[i].text,
                  promptIndex: i,
                  isBrandedPrompt: prompts[i].isBranded,
                  errorClass: callResult.errorClass,
                  errorMessage: callResult.errorMessage,
                  attempts: callResult.attempts,
                  latencyMs: callResult.latencyMs,
                  // NOT NULL: unpriced stores 0; its reserve row marks the cost incomplete.
                  costUsd: (callResult.costUsd ?? 0).toString(),
                })
                .onConflictDoNothing({
                  target: [
                    engineCallFailures.auditId,
                    engineCallFailures.engine,
                    engineCallFailures.promptIndex,
                  ],
                });

              return {
                kind: "failure" as const,
                errorClass: callResult.errorClass,
                costUsd: callResult.costUsd,
                capReserveUsd: callResult.capReserveUsd,
              };
            }

            const result = callResult.output;
            const mention = await detectBrandMention(result.response, loaded.brand);
            // Task #43: see lib/audit/run-audit-inline.ts's matching
            // comment -- both runners must merge structured citedUrls
            // the same way so they can't drift.
            const sources = mergeCitedSources(extractCitations(result.response), result.citedUrls);
            const sentLabel = mention.found ? "positive" : "neutral";
            const ctxLabel = mention.found ? "listed" : "absent";
            // Audit reliability, Part B: see lib/audit/run-audit-inline.ts's
            // matching comment -- both runners call the one resolver.
            const mentionVerification = mention.found
              ? verifyMention({
                  matchIndex: mention.matchIndex,
                  responseText: result.response,
                  citedSources: sources,
                  brand: {
                    domain: loaded.brand.domain,
                    suburb: loaded.brand.suburb,
                    city: loaded.brand.city,
                    state: loaded.brand.state,
                    locationConfirmedAt: loaded.brand.locationConfirmedAt,
                    locationMode: loaded.brand.locationMode,
                  },
                  resolvedGroundingDomains: result.groundingDomains,
                })
              : null;
            // "Audits time out on Vercel" follow-up, item 2 -- same
            // reasoning as the failure branch above: ON CONFLICT
            // (audit_id, engine, prompt_index) DO NOTHING makes a
            // replay's duplicate insert attempt safe, and this
            // attempt's own already-computed values (never read back
            // from the table -- tests/unit/scoring/no-stored-
            // position-read.test.ts is the named guard specifically
            // for citations.position) are what this step returns
            // either way.
            await serviceDb
              .insert(citations)
              .values({
                auditId,
                engine,
                prompt: prompts[i].text,
                promptIndex: i,
                isBrandedPrompt: prompts[i].isBranded,
                runNumber: 1,
                brandMentioned: mention.found,
                position: mention.position,
                mentionVerification,
                sentimentLabel: sentLabel,
                contextLabel: ctxLabel,
                responseSnippet: result.response.slice(0, 500),
                // Task #46 Phase 3, Part B: full answer text -- see
                // lib/audit/run-audit-inline.ts's matching comment.
                responseText: result.response,
                citedSources: sources,
                llmCostUsd: result.costEstimateUsd === null ? null : result.costEstimateUsd.toString(),
                llmTokensUsed: result.tokensUsed,
                llmModel: result.model,
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
              sentLabel,
              ctxLabel,
              sources,
              cost: result.costEstimateUsd,
              capReserveUsd: result.capReserveUsd ?? 0,
            };
          });
      }

      // Vunnara Build 1, Part F.1: one real LLM call per (engine,
      // prompt), always -- the replay loop this used to run
      // `runsPerPrompt` times is gone; runsPerPrompt is now always
      // RUNS_PER_PROMPT (1) via runsForTier, kept as a stored/
      // displayed count, not a loop bound. See lib/audit/run-audit-
      // inline.ts's matching comment.
      //
      // "Inngest: fit within the 5 concurrent steps of the free
      // plan", item 1 -- sized to the account's own Inngest
      // concurrency ceiling (deriveEngineCallConcurrency), not the
      // flat ENGINE_CALL_CONCURRENCY every engine used to get
      // regardless of how many account-wide slots were actually
      // available. Computed once per run (engines.length varies by
      // tier), shared by every engine's own pLimit below.
      const perEngineConcurrency = deriveEngineCallConcurrency(engines.length);

      async function runEngine(engine: Engine) {
        const callLimit = pLimit(perEngineConcurrency);
        // Every call:<engine>:<i> step.run() is created here without
        // being awaited individually -- Inngest's own parallel-steps
        // pattern -- so all of this ONE engine's (up to
        // perEngineConcurrency at a time) calls run concurrently
        // with each other, and this whole function call (one per
        // engine) runs concurrently with the other engines below.
        const tasks = prompts.map((_: unknown, i: number) => callLimit(() => runOneCall(engine, i)));
        return Promise.all(tasks);
      }

      const perEngineResults = await Promise.all(
        engines.map((engine: string) => runEngine(engine as Engine)),
      );

      for (let e = 0; e < engines.length; e++) {
        const engine = engines[e];
        for (let i = 0; i < prompts.length; i++) {
          const stepResult = perEngineResults[e][i];

          if (stepResult.kind === "failure") {
            engineFailures[engine] = (engineFailures[engine] ?? 0) + 1;
            costTally = addCost(costTally, stepResult.costUsd, stepResult.capReserveUsd);
            continue;
          }

          costTally = addCost(costTally, stepResult.cost, stepResult.capReserveUsd);
          callOutcomes.push({
            isBranded: prompts[i].isBranded,
            brandMentioned: stepResult.found,
            position: stepResult.position,
            mentionVerification: stepResult.mentionVerification,
            sentimentLabel: stepResult.sentLabel,
            contextLabel: stepResult.ctxLabel,
            citedSources: stepResult.sources,
            runNumber: 1,
          });
        }
      }

      const totalCalls = engines.length * prompts.length * runsPerPrompt;
      // Every dimension is scored from the ORGANIC subset only (task HH) --
      // see lib/audit/organic-citations.ts. `totalCalls` above (audit
      // size/cost, unaffected) stays the real total; only the scoring
      // inputs below use the organic-filtered counts.
      const organic = selectOrganicCitations(callOutcomes);

      const finalizeResult = await step.run("finalize", async () => {
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
        // rate" -- see lib/audit/run-audit-inline.ts's matching
        // comment. The stored scoreComposite/scoreConfidenceLow/High
        // columns now carry the mention rate itself, never a blend.
        const headline = freqScore;

        // Task SSS: feed the CI the TRUE independent-sample count (distinct
        // runNumber===1 observations), not the replay-inflated totals --
        // see lib/audit/organic-citations.ts. Scores above are unaffected.
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

        const [finalized] = await serviceDb
          .update(audits)
          .set({
            status: "complete",
            scoreComposite: headline.toFixed(2),
            scoreFrequency: freqScore.toFixed(2),
            scorePosition: posScore.toFixed(2),
            scoreSentiment: organic.sentiments[0] ?? "neutral",
            scoreSentimentNumeric: sentScore.toFixed(2),
            scoreContext: organic.contexts[0] ?? "absent",
            scoreContextNumeric: ctxScore.toFixed(2),
            scoreAccuracy: accScore.toFixed(2),
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
            // Build 1 addendum, item 6: merged, never overwritten.
            ...(Object.keys(engineFailures).length > 0
              ? { metadata: sql`metadata || ${JSON.stringify({ engineFailures })}::jsonb` }
              : {}),
          })
          // Reliability follow-up, item 3: see lib/audit/run-audit-
          // inline.ts's matching comment -- the stale-run guard could
          // have flipped this audit to "failed" while this step was
          // scoring; requiring a non-terminal status here means that
          // race loses cleanly instead of overwriting "failed" back
          // to "complete".
          .where(and(eq(audits.id, auditId), inArray(audits.status, ["pending", "running"])))
          .returning({ id: audits.id });

        if (!finalized) {
          // Stale-run guard follow-up, item 3 -- see lib/audit/run-
          // audit-inline.ts's matching comment: the money was still
          // actually spent even though the stale guard won this
          // race, so it's recorded here, inside this same memoized
          // step, before the outer function skips everything
          // SCORING-dependent (quality gates, drift, recommendations,
          // the completion email below).
          await recordCostForTerminalAudit(auditId, costTally);
        } else {
          // "Make the daily spend cap real", item 1 -- this, the
          // DEFAULT path whenever Inngest is reachable, previously
          // never called BudgetPolicyService.record() at all
          // (confirmed: lib/audit/run-audit-inline.ts -- only ever
          // used as a fallback -- was the sole caller in the whole
          // codebase), so DAILY_SPEND_CAP_CENTS has effectively never
          // seen real spend from most audits. Recorded inside this
          // same memoized step so an Inngest retry/replay of
          // "finalize" can never record twice -- and even if it
          // somehow did anyway, record()'s own ON CONFLICT (audit_id)
          // DO NOTHING (migration 0092) makes a second attempt a true
          // no-op at the database level, the same guarantee the
          // inline runner and the already-terminal branch above now
          // share.
          const capReserve = unpricedReserve(costTally);
          try {
            await BudgetPolicyService.record(auditId, costTally.knownUsd, "audit", capReserve);
          } catch (recordErr) {
            console.error("[run-audit] cost snapshot record failed (non-fatal):", recordErr);
          }
          // "Make the daily spend cap real", item 3 -- QualityGateService.
          // evaluate() only writes audits.quality_status, a column
          // nothing in the codebase reads back (confirmed by
          // exhaustive grep across app/, lib/, components/) and its
          // only other effect is an ObservabilityService.emit() that
          // is a plain console.log, never sent anywhere external --
          // it changes no audit status, no score, nothing the owner
          // sees. Safe to also run here, matching the inline runner.
          try {
            await QualityGateService.evaluate(auditId);
          } catch (qgErr) {
            console.error("[run-audit] quality gate evaluation failed (non-fatal):", qgErr);
          }
        }

        return { skipped: !finalized };
      });

      if (finalizeResult.skipped) {
        // "Make the daily spend cap real", item 3 -- now that this
        // path also runs QualityGateService (see the `else` branch
        // above), the already-terminal branch skips it too, matching
        // lib/audit/run-audit-inline.ts exactly: there's no live,
        // non-terminal audit left to attach a quality status, a
        // drift alert, a recommendation or a completion email to.
        // What's skipped by not sending audit.complete below is
        // everything that event fans out to: drift (detect-drift.ts),
        // recommendations (generate-recommendations.ts) and the
        // completion email (send-audit-complete-email.ts).
        console.warn(
          `[run-audit] audit ${auditId} was already in a terminal status when finalization tried to run (stale-run guard?) -- recorded the $${costTally.knownUsd.toFixed(4)} actually spent, but skipping the quality gate, drift, recommendations and the completion email`,
        );
        return { auditId, skipped: true, reason: "already_terminal" };
      }

      await step.sendEvent("audit-complete-email", {
        name: "audit.complete",
        data: {
          auditId,
          brandId: loaded.audit.brandId,
          organizationId: loaded.audit.organizationId,
        },
      });
      return { auditId, totalCost: costTally.knownUsd };
    } catch (err) {
      await serviceDb
        .update(audits)
        .set({
          status: "failed",
          failedAt: new Date(),
          metadata: {
            error: err instanceof Error ? err.message : String(err),
            errorCode: err instanceof Error ? err.name : undefined,
          },
        })
        .where(eq(audits.id, auditId))
        .catch(() => {});

      // Build 1 follow-up (entry-point check): this function has
      // `retries: 2` -- re-throwing here is correct for a genuinely
      // transient failure (an API timeout, a DB hiccup), which is
      // exactly what Inngest's retry exists for. But a brand needing
      // confirmation is DETERMINISTIC: the SAME auditId will fail the
      // SAME way on every retry, since nothing about the brand's
      // confirmation status changes between attempts. Re-throwing here
      // would retry this exact audit up to 3 total times for no
      // reason -- never useful, and exactly the retry storm this
      // follow-up's item 2 (required behaviour) rules out. Mark
      // failed above (already done) and return normally instead.
      if (err instanceof BrandNeedsConfirmationError) {
        return { auditId, skipped: true, reason: "brand_needs_confirmation" };
      }
      // Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 4: same reasoning
      // as BrandNeedsConfirmationError above -- a stale brand whose
      // pack failed to regenerate will fail the SAME way on every
      // retry (nothing about the brand changes between attempts), so
      // re-throwing would retry storm a deterministic failure for no
      // reason. Already marked failed above, with a readable message
      // and this error's name as the stable errorCode.
      if (err instanceof PromptPackGenerationError) {
        return { auditId, skipped: true, reason: "prompt_pack_generation_failed" };
      }
      throw err;
    }
  },
);
