import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionItems, audits, brands } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { buildRecommendations } from "@/lib/recommendations";
import type { RecommendationWithConfidence } from "@/lib/recommendations/types";

export const generateRecommendations = inngest.createFunction(
  { id: "generate-recommendations", retries: 2, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;

    const audit = await step.run("load-audit", async () => {
      const [row] = await db
        .select({
          id: audits.id,
          organizationId: audits.organizationId,
          brandId: audits.brandId,
          scoreFrequency: audits.scoreFrequency,
          scorePosition: audits.scorePosition,
          scoreSentimentNumeric: audits.scoreSentimentNumeric,
          scoreContextNumeric: audits.scoreContextNumeric,
          scoreAccuracy: audits.scoreAccuracy,
          scoreComposite: audits.scoreComposite,
          confidenceIntervals: audits.confidenceIntervals,
          status: audits.status,
        })
        .from(audits)
        .where(eq(audits.id, auditId));
      if (!row || row.status !== "complete") throw new Error(`Audit ${auditId} not complete`);
      return row;
    });

    const brand = await step.run("load-brand", async () => {
      const [row] = await db
        .select({ id: brands.id, vertical: brands.vertical, region: brands.region })
        .from(brands)
        .where(eq(brands.id, audit.brandId));
      return row;
    });

    const enriched: RecommendationWithConfidence[] = await step.run(
      "build-recommendations",
      async () => {
        return buildRecommendations(
          {
            scoreFrequency: audit.scoreFrequency,
            scorePosition: audit.scorePosition,
            scoreSentimentNumeric: audit.scoreSentimentNumeric,
            scoreContextNumeric: audit.scoreContextNumeric,
            scoreAccuracy: audit.scoreAccuracy,
            scoreComposite: audit.scoreComposite,
            confidenceIntervals: audit.confidenceIntervals,
            vertical: brand.vertical,
          },
          db,
        );
      },
    );

    await step.run("persist-recommendations", async () => {
      if (enriched.length === 0) return { skipped: true, reason: "no_recommendations_triggered" };

      await db
        .insert(actionItems)
        .values(
          enriched.map((rec) => ({
            organizationId: audit.organizationId,
            brandId: audit.brandId,
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
    });

    return { auditId, generated: enriched.length };
  },
);
