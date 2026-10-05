import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import type { Brand } from "@/db/schema";
import {
  actionItems,
  audits,
  brands,
  citations,
  driftAlerts,
  verticalPackPrompts,
  verticalPacks,
} from "@/db/schema";
import type { Tier } from "@/db/schema/enums";
import { subscriptions } from "@/db/schema/subscriptions";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { extractCitations } from "@/lib/audit/extract-citations";
import { isBrandedPackPrompt } from "@/lib/audit/flag-branded-prompts";
import { type AuditCallOutcome, selectOrganicCitations } from "@/lib/audit/organic-citations";
import { detectDrift } from "@/lib/drift/detect";
import { getLLMService } from "@/lib/llm";
import type { Engine, MockScenario, ModelTask } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { enginesForTier, PROMPTS_PER_AUDIT, runsForTier } from "@/lib/llm/tier-engines";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { QualityGateService } from "@/lib/platform/quality-gate.service";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { buildRecommendations } from "@/lib/recommendations";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { compositeVisibilityScore } from "@/lib/scoring/composite";
import { contextDimensionScore } from "@/lib/scoring/context";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { sentimentDimensionScore } from "@/lib/scoring/sentiment";
import type { BrandClassification } from "@/lib/types/brand";
import { expandPrompt, isBrandedPromptTemplate } from "@/lib/verticals/expand-prompt";

interface AuditPrompt {
  text: string;
  isBranded: boolean;
}

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
    } catch (budgetErr) {
      if (budgetErr instanceof Error && budgetErr.message === "Budget exceeded") {
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
        metadata: { mockScenario },
      });

      const mention = await detectBrandMention(result.response, b);
      const sources = extractCitations(result.response);
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
        citedSources: sources,
        llmCostUsd: result.costEstimateUsd.toString(),
        llmTokensUsed: result.tokensUsed,
        llmModel: result.model,
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

    async function runEngine(engine: Engine) {
      for (let i = 0; i < prompts.length; i++) {
        const batch = Array.from({ length: runsPerPrompt }, (_, r) =>
          runOneCall(engine, i, r + 1).catch((callErr) => {
            console.error(
              `[audit-inline] ${engine} prompt=${i} run=${r + 1} FAILED:`,
              callErr instanceof Error ? callErr.message : callErr,
            );
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

        const driftResult = detectDrift({
          currentScores,
          previousScores,
          currentCIs: cis as unknown as Record<string, { lower: number; upper: number }>,
          previousCIs,
          currentComposite: composite,
          previousComposite: Number(previous.scoreComposite ?? 0),
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
          },
          tx,
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

const REGION_DISPLAY: Record<string, string> = {
  au: "Australia",
  nz: "New Zealand",
  uk: "United Kingdom",
  us: "United States",
  ca: "Canada",
  eu: "Europe",
};

async function getAuditPrompts(brand: Brand, promptCount: number): Promise<AuditPrompt[]> {
  // brand.promptPack / buildPromptPack are pre-expanded string lists with no
  // surviving {brand} template to check via isBrandedPromptTemplate -- so
  // isBranded is flagged by provenance instead, via isBrandedPackPrompt
  // (set-membership against the enriched pool buildEnrichedPrompts would
  // deterministically produce for this classification + brand name).
  const classification = brand.classification as BrandClassification | null;
  if (brand.promptPack && Array.isArray(brand.promptPack) && brand.promptPack.length > 0) {
    if (brand.promptPack.length >= promptCount) {
      return brand.promptPack.slice(0, promptCount).map((text) => ({
        text,
        isBranded: isBrandedPackPrompt(text, classification, brand.name),
      }));
    }
    if (classification) {
      const regionLabel =
        brand.primaryRegions[0]?.replace(/^[A-Z]+:/, "") ??
        REGION_DISPLAY[brand.region] ??
        "Australia";
      return buildPromptPack(classification, brand.name, brand.domain, regionLabel, promptCount).map(
        (text) => ({ text, isBranded: isBrandedPackPrompt(text, classification, brand.name) }),
      );
    }
    return brand.promptPack.map((text) => ({
      text,
      isBranded: isBrandedPackPrompt(text, classification, brand.name),
    }));
  }

  if (classification) {
    const regionLabel =
      brand.primaryRegions[0]?.replace(/^[A-Z]+:/, "") ??
      REGION_DISPLAY[brand.region] ??
      "Australia";
    return buildPromptPack(classification, brand.name, brand.domain, regionLabel, promptCount).map(
      (text) => ({ text, isBranded: isBrandedPackPrompt(text, classification, brand.name) }),
    );
  }

  const [p] = await serviceDb
    .select()
    .from(verticalPacks)
    .where(
      and(
        eq(verticalPacks.vertical, brand.vertical),
        eq(verticalPacks.region, brand.region),
        isNull(verticalPacks.retiredAt),
      ),
    );

  if (!p) return [];

  const promptRows = await serviceDb
    .select()
    .from(verticalPackPrompts)
    .where(eq(verticalPackPrompts.packId, p.id))
    .orderBy(asc(verticalPackPrompts.rank))
    .limit(promptCount);

  return promptRows
    .flatMap((pr) => {
      const isBranded = isBrandedPromptTemplate(pr.promptTemplate);
      return expandPrompt(pr.promptTemplate, {
        brand,
        competitors: brand.competitors,
        locations: brand.primaryRegions.slice(0, 3),
      }).map((text) => ({ text, isBranded }));
    })
    .slice(0, promptCount);
}
