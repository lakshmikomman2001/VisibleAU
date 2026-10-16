import { and, eq, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { actionItems, audits, brands, citations } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { inngest } from "@/lib/inngest/client";
import {
  buildRecommendations,
  gatherRecommendationEvidence,
  productionCheckers,
  type RecommendationEvidence,
} from "@/lib/recommendations";
import type { RecommendationWithConfidence } from "@/lib/recommendations/types";

export const generateRecommendations = inngest.createFunction(
  { id: "generate-recommendations", retries: 2, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;

    const audit = await step.run("load-audit", async () => {
      const [row] = await serviceDb
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
      const [row] = await serviceDb
        .select({
          id: brands.id,
          name: brands.name,
          vertical: brands.vertical,
          region: brands.region,
        })
        .from(brands)
        .where(eq(brands.id, audit.brandId));
      return row;
    });

    // The TRUE independent mention-row count (organic, run_number = 1) --
    // the same basis as the audit page's insufficient-data gate. SUM()
    // comes back from Postgres as a string, hence Number().
    const mentionRowCount: number = await step.run("count-mention-rows", async () => {
      const [row] = await serviceDb
        .select({
          mentioned: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
        })
        .from(citations)
        .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));
      return Number(row?.mentioned ?? 0);
    });

    // Real brand-specific checks, in their own step: network-bound and
    // retryable independently of the DB work; never throws (a failed
    // check comes back "unavailable").
    const evidence: RecommendationEvidence = await step.run("gather-evidence", async () =>
      gatherRecommendationEvidence(
        { brandId: audit.brandId, brandName: brand.name },
        productionCheckers(serviceDb),
      ),
    );

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
            mentionRowCount,
          },
          serviceDb,
          evidence,
        );
      },
    );

    await step.run("persist-recommendations", async () => {
      if (enriched.length === 0) return { skipped: true, reason: "no_recommendations_triggered" };

      await serviceDb
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

    if (enriched.length > 0) {
      await step.run("emit-recommendation-created", async () => {
        await inngest.send({
          name: "recommendation.created",
          data: {
            auditId,
            brandId: audit.brandId,
            organizationId: audit.organizationId,
          },
        });
      });
    }

    return { auditId, generated: enriched.length };
  },
);
