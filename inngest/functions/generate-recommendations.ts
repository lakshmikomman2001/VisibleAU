import { and, eq, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import {
  buildRecommendations,
  gatherRecommendationEvidence,
  productionCheckers,
  type RecommendationEvidence,
} from "@/lib/recommendations";
import { persistRecommendations } from "@/lib/recommendations/persist";
import type { RecommendationWithConfidence } from "@/lib/recommendations/types";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

export const generateRecommendations = inngest.createFunction(
  {
    id: "generate-recommendations",
    retries: 2,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;

    const audit = await step.run("load-audit", async () => {
      const [row] = await serviceDb
        .select({
          id: audits.id,
          organizationId: audits.organizationId,
          brandId: audits.brandId,
          scoreFrequency: audits.scoreFrequency,
          scoreSentimentNumeric: audits.scoreSentimentNumeric,
          scoreContextNumeric: audits.scoreContextNumeric,
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
          categories: brands.categories,
        })
        .from(brands)
        .where(eq(brands.id, audit.brandId));
      return row;
    });

    // Audit #36 follow-up: no longer read -- the rules take the measured
    // counts from resolveOrganicDimensions inside "build-recommendations"
    // below. The step itself stays, with the same ID and return shape, so
    // a run in flight when this ships still finds every step it planned
    // (an Inngest StepNotFound otherwise). Remove it in a later release.
    await step.run("count-mention-rows", async () => {
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
        {
          brandId: audit.brandId,
          brandName: brand.name,
          auditId,
          region: brand.region,
          categories: brand.categories,
        },
        productionCheckers(serviceDb),
      ),
    );

    const enriched: RecommendationWithConfidence[] = await step.run(
      "build-recommendations",
      async () => {
        // The same counts the audit page shows (verified mentions in
        // successful everyday answers, ranks, sources).
        const counts = (await resolveOrganicDimensions(serviceDb, [auditId])).get(auditId);
        return buildRecommendations(
          {
            scoreFrequency: audit.scoreFrequency,
            scoreSentimentNumeric: audit.scoreSentimentNumeric,
            scoreContextNumeric: audit.scoreContextNumeric,
            scoreComposite: audit.scoreComposite,
            confidenceIntervals: audit.confidenceIntervals,
            vertical: brand.vertical,
            mentionDetail: counts
              ? {
                  mentionedCount: counts.mentionedCount,
                  rankedCount: counts.rankedCount,
                  medianPosition: counts.medianPosition,
                  sourcedCount: counts.sourcedCount,
                }
              : null,
          },
          serviceDb,
          evidence,
        );
      },
    );

    // "The Action Center shows each brand's latest audit only" (23
    // Oct), item 1 -- runs even when THIS audit found zero new
    // recommendations: this audit is still the brand's latest
    // complete one, so any OLDER open items are superseded either
    // way. persistRecommendations (lib/recommendations/persist.ts) is
    // the ONE shared implementation both real-audit writers call, so
    // the dismiss-old-opens / skip-if-in-progress rules can't drift
    // between this Inngest function and lib/audit/run-audit-inline.ts.
    await step.run("persist-recommendations", async () => {
      return persistRecommendations(serviceDb, {
        auditId,
        organizationId: audit.organizationId,
        brandId: audit.brandId,
        recommendations: enriched,
      });
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
