import { desc, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { upsertConsensusCheck } from "@/lib/trust/consensus-checker";
import { sendConsensusAlert } from "@/lib/communication/alert-composer";

const SOURCE_TYPES = [
  "website",
  "google_business_profile",
  "local_directory",
  "linkedin",
  "reddit",
  "wikipedia",
  "review_site",
] as const;

export const checkCrossPlatformConsensusFn = inngest.createFunction(
  {
    id: "check-cross-platform-consensus",
    retries: 2,
    triggers: [{ cron: "0 3 4 * *" }],
  },
  async ({ step }: { step: any }) => {
    const allBrands = await step.run("load-brands", async () => {
      return serviceDb.select().from(brands);
    });

    let processed = 0;

    for (const brand of allBrands) {
      await step.run(`check-${brand.id}`, async () => {
        for (const sourceType of SOURCE_TYPES) {
          const input = {
            sourceType,
            sourceUrl: null,
            nameMatch: true,
            serviceMatch: true,
            locationMatch: true,
            pricePositioning: "not_stated" as const,
            differentiatorsMatch: true,
          };

          if (process.env.LLM_MODE !== "mock") {
            // Phase 2: fetch source and compare against brand profile
            // TODO: implement per-source checking in production
          }

          await upsertConsensusCheck(
            serviceDb,
            brand.id,
            brand.organizationId,
            "AU_EN",
            input,
          );
        }

        processed++;
      });

      await step.run(`alert-${brand.id}`, async () => {
        const { actionItems, audits, brandConsensusChecks } = await import("@/db/schema");
        const checks = await serviceDb
          .select()
          .from(brandConsensusChecks)
          .where(eq(brandConsensusChecks.brandId, brand.id));

        const scores = checks
          .map((c) => c.consistencyScore)
          .filter((s): s is number => s !== null);

        if (scores.length === 0) return;

        const avgScore = Math.round(
          scores.reduce((a, b) => a + b, 0) / scores.length,
        );

        // In-app Action Center alert at < 70 (LLD 7252)
        if (avgScore < 70) {
          const [latestAudit] = await serviceDb
            .select({ id: audits.id })
            .from(audits)
            .where(eq(audits.brandId, brand.id))
            .orderBy(desc(audits.createdAt))
            .limit(1);

          if (latestAudit) {
            await serviceDb
              .insert(actionItems)
              .values({
                organizationId: brand.organizationId,
                brandId: brand.id,
                auditId: latestAudit.id,
                recommendationKey: "consensus_below_70",
                dimension: "trust",
                title: "Cross-platform consensus below threshold",
                action: `Consensus score is ${avgScore}/100 across ${scores.length} sources — review inconsistent brand facts across platforms.`,
                confidenceLabel: "High",
                expectedImpactScore: "high",
                evidenceRefs: [],
              })
              .onConflictDoNothing();
          }
        }

        // Email alert at consistency_score < 60 (LLD 8402)
        if (avgScore < 60) {
          const lowScoreSources = checks
            .filter((c) => c.consistencyScore !== null && c.consistencyScore < 60)
            .map((c) => c.sourceType);

          await sendConsensusAlert({
            organizationId: brand.organizationId,
            brandName: brand.name,
            sourceType: lowScoreSources.join(", "),
            discrepancyDetails: `Average consistency score is ${avgScore}/100 across ${scores.length} sources.`,
            consensusUrl: `/brands/${brand.id}/trust/consensus`,
          });
        }
      });
    }

    return { processed };
  },
);
