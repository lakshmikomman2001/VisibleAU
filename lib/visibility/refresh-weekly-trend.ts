import { endOfISOWeek, startOfISOWeek } from "date-fns";
import { desc, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { visibilityTrends } from "@/db/schema";
import { aggregateVisibilityTrend, formatPeriodLabel } from "./visibility-trend-aggregator";

/**
 * One brand's weekly visibility trend row (visibility_trends), for the ISO week of `completedAt`: recomputed from
 * the audits that count in it and upserted. Moved here unchanged from inngest/functions/aggregate-visibility-
 * trend.ts's "aggregate-trend" step (14 Nov, part 5) so /admin/audits can recompute a week when an operator
 * excludes an audit from trends, or includes it again. The step calls this; its id and behaviour are unchanged.
 */
export async function refreshWeeklyVisibilityTrend(
  tx: DbClient,
  context: {
    brandId: string;
    organizationId: string;
    brandDomain: string;
    completedAt: Date;
  },
): Promise<{ periodLabel: string; periodType: "weekly"; auditCount: number }> {
  const periodType = "weekly" as const;
  const periodStart = startOfISOWeek(context.completedAt);
  const periodEnd = endOfISOWeek(context.completedAt);
  const periodLabel = formatPeriodLabel(context.completedAt, periodType);

  // Leftovers task, part 6 (17 Nov): the latest 12 weeks by their period, not by when each was last recomputed
  // (an exclusion recomputes an older week, which made it "newest").
  const historicalTrends = await tx
    .select({ citationRate: visibilityTrends.citationRate })
    .from(visibilityTrends)
    .where(eq(visibilityTrends.brandId, context.brandId))
    .orderBy(desc(visibilityTrends.periodLabel))
    .limit(12);

  const historicalCitationRates = historicalTrends
    .map((t) => (t.citationRate ? Number(t.citationRate) : null))
    .filter((r): r is number => r !== null);

  const trend = await aggregateVisibilityTrend(tx, {
    brandId: context.brandId,
    organizationId: context.organizationId,
    periodLabel,
    periodType,
    periodStart,
    periodEnd,
    brandDomain: context.brandDomain,
    historicalCitationRates,
  });

  await tx
    .insert(visibilityTrends)
    .values({
      brandId: context.brandId,
      organizationId: context.organizationId,
      periodLabel,
      periodType,
      scoreCompositeAvg: trend.scoreCompositeAvg?.toString(),
      scoreFrequencyAvg: trend.scoreFrequencyAvg?.toString(),
      scoreSentimentAvg: trend.scoreSentimentAvg?.toString(),
      scoreAccuracyAvg: trend.scoreAccuracyAvg?.toString(),
      scorePositionAvg: trend.scorePositionAvg?.toString(),
      scoreContextAvg: trend.scoreContextAvg?.toString(),
      auditCount: trend.auditCount,
      sampleQuality: trend.sampleQuality,
      mentionRate: trend.mentionRate.toString(),
      citationRate: trend.citationRate.toString(),
      mentionSourceRatio: trend.mentionSourceRatio?.toString() ?? null,
      brandArchetype: trend.brandArchetype,
      marketCompetitionLabel: trend.marketCompetitionLabel,
      citationVolatilityScore: trend.citationVolatilityScore?.toString() ?? null,
      methodologyVersion: trend.methodologyVersion,
    })
    .onConflictDoUpdate({
      target: [visibilityTrends.brandId, visibilityTrends.periodLabel, visibilityTrends.periodType],
      set: {
        scoreCompositeAvg: trend.scoreCompositeAvg?.toString(),
        scoreFrequencyAvg: trend.scoreFrequencyAvg?.toString(),
        scoreSentimentAvg: trend.scoreSentimentAvg?.toString(),
        scoreAccuracyAvg: trend.scoreAccuracyAvg?.toString(),
        scorePositionAvg: trend.scorePositionAvg?.toString(),
        scoreContextAvg: trend.scoreContextAvg?.toString(),
        auditCount: trend.auditCount,
        sampleQuality: trend.sampleQuality,
        mentionRate: trend.mentionRate.toString(),
        citationRate: trend.citationRate.toString(),
        mentionSourceRatio: trend.mentionSourceRatio?.toString() ?? null,
        brandArchetype: trend.brandArchetype,
        marketCompetitionLabel: trend.marketCompetitionLabel,
        citationVolatilityScore: trend.citationVolatilityScore?.toString() ?? null,
        methodologyVersion: trend.methodologyVersion,
        // Leftovers task, part 6 (17 Nov): calculated_at is when the row was last computed. It was set only when
        // the row was first made, so a week recomputed after each audit and each exclusion still read "calculated
        // 12 Nov 10:26" in production -- as if the recompute had stopped.
        calculatedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return { periodLabel, periodType, auditCount: trend.auditCount };
}
