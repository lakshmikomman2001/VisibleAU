import { format, startOfISOWeek, startOfMonth } from "date-fns";
import { and, avg, count, countDistinct, eq, gte, lte, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, citations } from "@/db/schema";
import { sufficientMentionsExists } from "@/lib/audit/organic-filter";
import { classifyByScore } from "@/lib/confidence-labels/classify";
import { NOT_MEASURED_DIMENSION, resolveComposite } from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { classifyArchetype, classifyMarketCompetition } from "./mention-source-divide";
import type { VisibilityTrendInput } from "./types";

export function formatPeriodLabel(date: Date, periodType: "weekly" | "monthly"): string {
  if (periodType === "weekly") {
    return format(startOfISOWeek(date), "yyyy-'W'II");
  }
  return format(startOfMonth(date), "yyyy-MM");
}

interface TrendResult {
  scoreCompositeAvg: number | null;
  scoreFrequencyAvg: number | null;
  scoreSentimentAvg: number | null;
  scoreAccuracyAvg: number | null;
  scorePositionAvg: number | null;
  scoreContextAvg: number | null;
  auditCount: number;
  sampleQuality: string;
  mentionRate: number;
  citationRate: number;
  mentionSourceRatio: number | null;
  brandArchetype: string;
  marketCompetitionLabel: string | null;
  citationVolatilityScore: number | null;
}

export async function aggregateVisibilityTrend(
  tx: DbClient,
  input: VisibilityTrendInput & {
    periodStart: Date;
    periodEnd: Date;
    brandDomain: string;
    competitorAvgShare?: number;
    competitorCount?: number;
    brandShare?: number;
    historicalCitationRates?: number[];
  },
): Promise<TrendResult> {
  const { brandId, periodStart, periodEnd } = input;

  // Task #46 Phase 2, Part 4: excludes zero-mention ("frequency_only"
  // basis) audits from BOTH the numerator and denominator of every
  // average below, including auditCount -- not just scoreCompositeAvg.
  // A zero-mention audit's composite is real (it equals Frequency
  // alone) but isn't a genuine 5-dimension measurement, so blending it
  // into scoreCompositeAvg (or scorePositionAvg etc, which are real 0s
  // too, not NULLs Postgres' AVG() would skip on its own) drags the
  // period's average down as if the brand had been scored badly across
  // the board, when the honest story is "this audit had nothing to
  // measure beyond Frequency." One simplification accepted here:
  // Frequency's OWN average would, in isolation, remain valid even at
  // 0 mentions (lib/scoring/dimension-result.ts's alwaysScored) -- this
  // excludes it from frequencyAvg too, for one consistent rule across
  // all six fields rather than a second query just for Frequency.
  // Excluding from the denominator (not just nulling the numerator) is
  // also what makes `auditCount` below correctly read as "how many
  // audits in this period had real dimensional data," which is exactly
  // what sampleQuality needs: a period with audits but zero sufficient
  // ones now correctly reports "Insufficient data" via the
  // auditCount === 0 branch below, rather than treating a raw audit
  // count as if it implied real measurement quality.
  // Task #46 (fix: stored value contradicting its own CI): scoreComposite/
  // scoreFrequency/scoreAccuracy/scorePosition below used to average the
  // STORED audits.score_* columns directly -- a snapshot from whenever
  // each audit completed, never recomputed, so a prod-fix that changes
  // which citations rows count as organic (without the audits being
  // re-run) leaves this period's average stale, feeding a wrong number
  // into both the Wins Feed and narrative-report sentences that read
  // visibility_trends downstream. This period/brand scope is always a
  // handful of audits (at most one per scheduled run), so a live,
  // batched recompute (one extra query, no N+1) is cheap. Sentiment/
  // Context keep averaging their stored columns unchanged -- Phase 3's
  // "not_measured" treatment was never extended to visibility_trends,
  // and doing so is a separate, larger schema change outside this fix's
  // scope (flagged, not done here).
  const auditRows = await tx
    .select({
      id: audits.id,
      sentimentAvgInput: audits.scoreSentimentNumeric,
      contextAvgInput: audits.scoreContextNumeric,
    })
    .from(audits)
    .where(
      and(
        eq(audits.brandId, brandId),
        eq(audits.status, "complete"),
        gte(audits.completedAt, periodStart),
        lte(audits.completedAt, periodEnd),
        sufficientMentionsExists(audits.id),
      ),
    );

  const auditCount = auditRows.length;
  const periodAuditIds = auditRows.map((r) => r.id);
  const resolvedByAuditId = await resolveOrganicDimensions(tx, periodAuditIds);

  function average(values: number[]): number | null {
    return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
  }
  const compositeValues: number[] = [];
  const frequencyValues: number[] = [];
  const positionValues: number[] = [];
  const accuracyValues: number[] = [];
  for (const auditId of periodAuditIds) {
    const resolved = resolvedByAuditId.get(auditId);
    if (!resolved) continue;
    if (resolved.frequency.status === "scored") frequencyValues.push(resolved.frequency.value);
    if (resolved.position.status === "scored") positionValues.push(resolved.position.value);
    if (resolved.accuracy.status === "scored") accuracyValues.push(resolved.accuracy.value);
    // Reuses resolveComposite itself (not a reimplemented blend) so this
    // period average matches what the audit page itself would show for
    // each of these audits, not the stored (possibly stale) composite.
    compositeValues.push(
      resolveComposite({
        frequency: resolved.frequency,
        position: resolved.position,
        sentiment: NOT_MEASURED_DIMENSION,
        context: NOT_MEASURED_DIMENSION,
        accuracy: resolved.accuracy,
      }).value,
    );
  }

  const row = {
    compositeAvg: average(compositeValues),
    frequencyAvg: average(frequencyValues),
    positionAvg: average(positionValues),
    accuracyAvg: average(accuracyValues),
    sentimentAvg:
      auditRows.length > 0
        ? auditRows.reduce((s, r) => s + Number(r.sentimentAvgInput ?? 0), 0) / auditRows.length
        : null,
    contextAvg:
      auditRows.length > 0
        ? auditRows.reduce((s, r) => s + Number(r.contextAvgInput ?? 0), 0) / auditRows.length
        : null,
  };

  const sampleQuality =
    auditCount === 0
      ? "Insufficient data"
      : classifyByScore(auditCount >= 5 ? 80 : auditCount >= 3 ? 50 : 20);

  // A branded prompt ("Is {brand} reputable?") guarantees a trivial mention
  // -- excluded from the mention/citation pool entirely, same scoping AA
  // applied to Share of Voice, so the two measure the same organic signal.
  // `IS NOT TRUE` (not `<> true`) keeps NULL rows (legacy citations written
  // before this column existed) as unfiltered, per that same pattern --
  // `<> true` would silently drop them too under SQL's NULL semantics.
  const notBrandedPrompt = sql`${citations.isBrandedPrompt} IS NOT TRUE`;

  const mentionResult = await tx
    .select({
      totalPrompts: countDistinct(citations.prompt),
      mentionedPrompts: sql<number>`COUNT(DISTINCT CASE WHEN ${citations.brandMentioned} = true THEN ${citations.prompt} END)`,
    })
    .from(citations)
    .innerJoin(audits, eq(citations.auditId, audits.id))
    .where(
      and(
        eq(audits.brandId, brandId),
        eq(audits.status, "complete"),
        gte(audits.completedAt, periodStart),
        lte(audits.completedAt, periodEnd),
        notBrandedPrompt,
      ),
    );

  const totalPrompts = Number(mentionResult[0]?.totalPrompts ?? 0);
  const mentionedPrompts = Number(mentionResult[0]?.mentionedPrompts ?? 0);

  const brandDomainJson = JSON.stringify([{ domain: input.brandDomain }]);
  const citedResult = await tx
    .select({
      citedPrompts: sql<number>`COUNT(DISTINCT CASE WHEN ${citations.citedSources} @> ${brandDomainJson}::jsonb THEN ${citations.prompt} END)`,
    })
    .from(citations)
    .innerJoin(audits, eq(citations.auditId, audits.id))
    .where(
      and(
        eq(audits.brandId, brandId),
        eq(audits.status, "complete"),
        gte(audits.completedAt, periodStart),
        lte(audits.completedAt, periodEnd),
        notBrandedPrompt,
      ),
    );

  const citedPrompts = Number(citedResult[0]?.citedPrompts ?? 0);

  const mentionRate =
    totalPrompts > 0 ? Math.round((mentionedPrompts / totalPrompts) * 100 * 100) / 100 : 0;
  const citationRate =
    totalPrompts > 0 ? Math.round((citedPrompts / totalPrompts) * 100 * 100) / 100 : 0;

  const archetypeResult = classifyArchetype(mentionRate, citationRate);

  const marketCompetitionLabel = classifyMarketCompetition(
    input.brandShare ?? 0,
    input.competitorAvgShare ?? 0,
    input.competitorCount ?? 0,
  );

  const volatility = computeVolatility(input.historicalCitationRates ?? [], auditCount);

  return {
    scoreCompositeAvg: row.compositeAvg,
    scoreFrequencyAvg: row.frequencyAvg,
    scoreSentimentAvg: row.sentimentAvg,
    scoreAccuracyAvg: row.accuracyAvg,
    scorePositionAvg: row.positionAvg,
    scoreContextAvg: row.contextAvg,
    auditCount,
    sampleQuality: sampleQuality.charAt(0).toUpperCase() + sampleQuality.slice(1),
    mentionRate,
    citationRate,
    mentionSourceRatio: archetypeResult.mentionSourceRatio,
    brandArchetype: archetypeResult.brandArchetype,
    marketCompetitionLabel,
    citationVolatilityScore: volatility,
  };
}

function computeVolatility(historicalRates: number[], auditCount: number): number | null {
  if (auditCount < 3 || historicalRates.length < 3) return null;

  const mean = historicalRates.reduce((sum, r) => sum + r, 0) / historicalRates.length;
  const variance =
    historicalRates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / historicalRates.length;
  const stdDev = Math.sqrt(variance);

  return Math.round(stdDev * 100) / 100;
}

export { computeVolatility };
