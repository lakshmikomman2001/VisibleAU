import { and, avg, count, countDistinct, eq, gte, lte, sql } from "drizzle-orm";
import { format, startOfISOWeek, startOfMonth } from "date-fns";
import type { DbClient } from "@/db/client";
import { audits, citations } from "@/db/schema";
import { classifyByScore } from "@/lib/confidence-labels/classify";
import { classifyArchetype, classifyMarketCompetition } from "./mention-source-divide";
import type { VisibilityTrendInput } from "./types";

export function formatPeriodLabel(
  date: Date,
  periodType: "weekly" | "monthly",
): string {
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

  const auditRows = await tx
    .select({
      compositeAvg: avg(audits.scoreComposite),
      frequencyAvg: avg(audits.scoreFrequency),
      sentimentAvg: avg(audits.scoreSentimentNumeric),
      accuracyAvg: avg(audits.scoreAccuracy),
      positionAvg: avg(audits.scorePosition),
      contextAvg: avg(audits.scoreContextNumeric),
      auditCount: count(audits.id),
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

  const row = auditRows[0];
  const auditCount = Number(row?.auditCount ?? 0);

  const sampleQuality =
    auditCount === 0
      ? "Insufficient data"
      : classifyByScore(auditCount >= 5 ? 80 : auditCount >= 3 ? 50 : 20);

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
      ),
    );

  const citedPrompts = Number(citedResult[0]?.citedPrompts ?? 0);

  const mentionRate =
    totalPrompts > 0
      ? Math.round((mentionedPrompts / totalPrompts) * 100 * 100) / 100
      : 0;
  const citationRate =
    totalPrompts > 0
      ? Math.round((citedPrompts / totalPrompts) * 100 * 100) / 100
      : 0;

  const archetypeResult = classifyArchetype(mentionRate, citationRate);

  const marketCompetitionLabel = classifyMarketCompetition(
    input.brandShare ?? 0,
    input.competitorAvgShare ?? 0,
    input.competitorCount ?? 0,
  );

  const volatility = computeVolatility(
    input.historicalCitationRates ?? [],
    auditCount,
  );

  return {
    scoreCompositeAvg: row?.compositeAvg ? Number(row.compositeAvg) : null,
    scoreFrequencyAvg: row?.frequencyAvg ? Number(row.frequencyAvg) : null,
    scoreSentimentAvg: row?.sentimentAvg ? Number(row.sentimentAvg) : null,
    scoreAccuracyAvg: row?.accuracyAvg ? Number(row.accuracyAvg) : null,
    scorePositionAvg: row?.positionAvg ? Number(row.positionAvg) : null,
    scoreContextAvg: row?.contextAvg ? Number(row.contextAvg) : null,
    auditCount,
    sampleQuality:
      sampleQuality.charAt(0).toUpperCase() + sampleQuality.slice(1),
    mentionRate,
    citationRate,
    mentionSourceRatio: archetypeResult.mentionSourceRatio,
    brandArchetype: archetypeResult.brandArchetype,
    marketCompetitionLabel,
    citationVolatilityScore: volatility,
  };
}

function computeVolatility(
  historicalRates: number[],
  auditCount: number,
): number | null {
  if (auditCount < 3 || historicalRates.length < 3) return null;

  const mean =
    historicalRates.reduce((sum, r) => sum + r, 0) / historicalRates.length;
  const variance =
    historicalRates.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    historicalRates.length;
  const stdDev = Math.sqrt(variance);

  return Math.round(stdDev * 100) / 100;
}

export { computeVolatility };
