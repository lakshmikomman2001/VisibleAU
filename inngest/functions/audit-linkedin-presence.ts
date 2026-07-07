import { desc, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands, linkedinPresenceAudits } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { scoreLinkedinPresence } from "@/lib/trust/linkedin-auditor";

export const auditLinkedinPresenceFn = inngest.createFunction(
  {
    id: "audit-linkedin-presence",
    retries: 2,
    triggers: [{ cron: "0 3 2 * *" }],
  },
  async ({ step }: { step: any }) => {
    const allBrands = await step.run("load-brands", async () => {
      return serviceDb.select().from(brands);
    });

    let processed = 0;

    for (const brand of allBrands) {
      await step.run(`audit-${brand.id}`, async () => {
        const input = {
          companyPageUrl: null,
          companyPageExists: false,
          companyPageFollowers: 0,
          companyPosts30d: 0,
          companyArticlesCount: 0,
          founderProfileUrl: null,
          founderProfileExists: false,
          founderFollowers: 0,
          founderPosts30d: 0,
          founderArticlesCount: 0,
          founderArticles500plus: 0,
          knowledgeSharingRatio: 0,
          originalContentRatio: 0,
          semanticRelevanceScore: 0,
        };

        if (process.env.LLM_MODE !== "mock") {
          // Phase 2: public page scraping via cheerio
          // Brand provides company_page_url + founder_profile_url
          // TODO: implement cheerio scraping in Phase 2 production
        }

        const result = scoreLinkedinPresence(input);

        await serviceDb.insert(linkedinPresenceAudits).values({
          brandId: brand.id,
          organizationId: brand.organizationId,
          companyPageUrl: input.companyPageUrl,
          companyPageExists: input.companyPageExists,
          companyPageFollowers: input.companyPageFollowers,
          companyPosts30d: input.companyPosts30d,
          companyArticlesCount: input.companyArticlesCount,
          founderProfileUrl: input.founderProfileUrl,
          founderProfileExists: input.founderProfileExists,
          founderFollowers: input.founderFollowers,
          founderPosts30d: input.founderPosts30d,
          founderArticlesCount: input.founderArticlesCount,
          founderArticles500plus: input.founderArticles500plus,
          knowledgeSharingRatio: String(input.knowledgeSharingRatio),
          originalContentRatio: String(input.originalContentRatio),
          semanticRelevanceScore: String(input.semanticRelevanceScore),
          presenceScore: result.presenceScore,
          gaps: result.gaps,
        });

        processed++;
      });
    }

    return { processed };
  },
);
