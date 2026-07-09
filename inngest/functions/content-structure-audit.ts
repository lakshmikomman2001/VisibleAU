import { eq, and } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands, contentStructureAudits, subscriptions } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { crawlSite } from "@/lib/crawler";
import { auditContentStructure } from "@/lib/retrieval/content-auditor";
import { computeCitationProbability } from "@/lib/retrieval/citation-probability-scorer";
import { auditEntityHome } from "@/lib/retrieval/entity-home-auditor";
import { recommendFormat } from "@/lib/retrieval/content-format-advisor";

export const contentStructureAuditFn = inngest.createFunction(
  {
    id: "content-structure-audit",
    retries: 1,
    triggers: [{ cron: "0 22 * * 3" }],
  },
  async ({ step }: { step: any }) => {
    const allBrands = await step.run("load-brands", async () => {
      const rows = await serviceDb
        .select({
          id: brands.id,
          organizationId: brands.organizationId,
          domain: brands.domain,
          name: brands.name,
        })
        .from(brands)
        .innerJoin(subscriptions, eq(subscriptions.organizationId, brands.organizationId))
        .where(and(
          eq(subscriptions.status, "active"),
        ));
      return rows;
    });

    let auditedCount = 0;

    for (const brand of allBrands) {
      await step.run(`audit-${brand.id}`, async () => {
        const crawlResult = await crawlSite(brand.domain, {
          userAgent: "GPTBot/1.1",
          maxPages: 20,
          timeoutMs: 15000,
        });

        const formatMix: Record<string, number> = {};

        for (const page of crawlResult.pages) {
          const audit = auditContentStructure(page);
          const citProb = computeCitationProbability({
            contentFormatDetected: audit.contentFormatDetected,
            answerCapsuleScore: audit.answerCapsuleScore,
            freshnessRisk: audit.freshnessRisk,
            isEntityHomeCandidate: false,
            optimalPassageCount: audit.optimalPassageCount,
            outboundCitationCount: audit.outboundCitationCount,
            hasAuthorAttribution: audit.hasAuthorAttribution,
          });

          formatMix[audit.contentFormatDetected] = (formatMix[audit.contentFormatDetected] ?? 0) + 1;

          await serviceDb
            .insert(contentStructureAudits)
            .values({
              brandId: brand.id,
              organizationId: brand.organizationId,
              pageUrl: page.url,
              answerCapsuleScore: audit.answerCapsuleScore,
              faqBlockPresent: audit.faqBlockPresent,
              faqSchemaPresent: audit.faqSchemaPresent,
              headingStructure: audit.headingStructure,
              wordCount: audit.wordCount,
              optimalPassageCount: audit.optimalPassageCount,
              daysSincePublished: audit.daysSincePublished,
              freshnessRisk: audit.freshnessRisk,
              contentFormatDetected: audit.contentFormatDetected,
              citationProbabilityScore: citProb.toFixed(3),
              outboundCitationCount: audit.outboundCitationCount,
              hasAuthorAttribution: audit.hasAuthorAttribution,
            })
            .onConflictDoUpdate({
              target: [contentStructureAudits.brandId, contentStructureAudits.pageUrl],
              set: {
                answerCapsuleScore: audit.answerCapsuleScore,
                faqBlockPresent: audit.faqBlockPresent,
                faqSchemaPresent: audit.faqSchemaPresent,
                headingStructure: audit.headingStructure,
                wordCount: audit.wordCount,
                optimalPassageCount: audit.optimalPassageCount,
                daysSincePublished: audit.daysSincePublished,
                freshnessRisk: audit.freshnessRisk,
                contentFormatDetected: audit.contentFormatDetected,
                citationProbabilityScore: citProb.toFixed(3),
                outboundCitationCount: audit.outboundCitationCount,
                hasAuthorAttribution: audit.hasAuthorAttribution,
                auditedAt: new Date(),
              },
            });
        }

        auditedCount++;
      });
    }

    return { auditedBrands: auditedCount };
  },
);
