import { desc, eq } from "drizzle-orm";
import { endOfISOWeek, startOfISOWeek } from "date-fns";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, visibilityTrends } from "@/db/schema";
import {
  aggregateVisibilityTrend,
  formatPeriodLabel,
} from "@/lib/visibility/visibility-trend-aggregator";
import { inngest } from "@/lib/inngest/client";

export const aggregateVisibilityTrendFn = inngest.createFunction(
  { id: "aggregate-visibility-trend", retries: 2, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string; brandId?: string; organizationId?: string } }; step: any }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const context = await step.run("load-context", async () => {
      const [audit] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
      if (!audit) return null;

      const brandId = eventBrandId ?? audit.brandId;
      const orgId = eventOrgId ?? audit.organizationId;
      const completedAt = audit.completedAt ?? new Date();

      const [brand] = await serviceDb.select({ domain: brands.domain }).from(brands).where(eq(brands.id, brandId));

      return { brandId, organizationId: orgId, brandDomain: brand?.domain ?? "", completedAt };
    });

    if (!context) return { skipped: true, reason: "audit_not_found" };

    const result = await step.run("aggregate-trend", async () => {
      return withRlsContext(context.organizationId, async (tx) => {
        const periodType = "weekly" as const;
        const periodStart = startOfISOWeek(context.completedAt);
        const periodEnd = endOfISOWeek(context.completedAt);
        const periodLabel = formatPeriodLabel(context.completedAt, periodType);

        const historicalTrends = await tx
          .select({ citationRate: visibilityTrends.citationRate })
          .from(visibilityTrends)
          .where(eq(visibilityTrends.brandId, context.brandId))
          .orderBy(desc(visibilityTrends.calculatedAt))
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
          })
          .onConflictDoUpdate({
            target: [
              visibilityTrends.brandId,
              visibilityTrends.periodLabel,
              visibilityTrends.periodType,
            ],
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
              updatedAt: new Date(),
            },
          });

        return { periodLabel, periodType, auditCount: trend.auditCount };
      });
    });

    await step.run("emit-trend-aggregated", async () => {
      await inngest.send({
        name: "trend/aggregated",
        data: {
          brandId: context.brandId,
          organizationId: context.organizationId,
          periodLabel: result.periodLabel,
          periodType: result.periodType,
        },
      });
    });

    return result;
  },
);
