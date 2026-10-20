import { format, startOfISOWeek, startOfMonth } from "date-fns";
import { and, avg, count, countDistinct, eq, gte, lte, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, citations } from "@/db/schema";
import { classifyByScore } from "@/lib/confidence-labels/classify";
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

  // Vunnara (21 Oct, hotfix: "Usually #16"), item 1's trends decision:
  // positionValues below already comes from resolveOrganicDimensions
  // (lib/scoring/resolve-audit-dimensions.ts), which this same hotfix
  // just moved onto the real, read-time-recomputed rank -- so every
  // NEW visibility_trends row this aggregator writes from now on
  // already gets a correct score_position_avg, no change needed here.
  // The only stale data is HISTORICAL rows written before this fix (or
  // by 0083's own one-time recompute, which itself still trusted the
  // old PERCENTILE_CONT-over-citations.position heuristic). Decision:
  // no 0084 backfill prod-fix for those -- grep confirms score_
  // position_avg has no reader anywhere (not the Wins Feed, not
  // narrative reports, not any UI/API route; only this writer, the
  // Inngest job that calls it, its own schema column, and the parity
  // test). A backfill would be pure, riskless-but-pointless prod
  // writing for a value nobody will ever see -- "stop storing" in
  // spirit, without a schema migration to actually drop the unread
  // column, which is out of this hotfix's scope.
  //
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
  //
  // Vunnara (20 Oct, post-a093ceb), item 4: no longer filtered by the
  // removed sufficientMentionsExists (lib/audit/organic-filter.ts) --
  // that filter excluded every zero-mention audit from this query
  // entirely, which silently biased every average in this period
  // upward (a real 0% week just vanished from both the numerator and
  // denominator, rather than pulling the average down the way a real
  // 0% should). The headline is always the Frequency DimensionResult
  // alone now, so a zero-mention audit's composite is exactly as real
  // and comparable as any other -- it's excluded only when there
  // weren't enough successful answers to measure a rate from at all
  // (resolveHeadline's own insufficient_data/"no_answers" gate below),
  // never on mention count.
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
      ),
    );

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
    // Vunnara (19 Oct): scoreCompositeAvg now averages the HEADLINE
    // (= Frequency DimensionResult, never a blend), resolved live from
    // citations for EVERY audit regardless of age -- no date-based
    // special-casing, so a past period re-aggregated after this change
    // uses the exact same definition as a new one (no artificial jump at
    // the changeover). insufficient_data ("no_answers" -- too few
    // successful answers, never mention count) audits are skipped,
    // same as the other dimensions, rather than counted as 0.
    if (resolved.headline.status === "scored") compositeValues.push(resolved.headline.value);
  }

  // Vunnara (20 Oct, post-a093ceb), item 4: auditCount is the number of
  // audits with a real, SCORED headline this period -- not auditRows.length
  // (every complete audit in the period, which now includes real
  // zero-mention ones too). A zero-mention audit with a real sample
  // still counts here (compositeValues pushed its real 0%); an audit
  // whose own sample was too small to measure a rate from at all
  // doesn't, exactly matching what sampleQuality below needs ("how many
  // audits had real dimensional data").
  const auditCount = compositeValues.length;

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
