import { eq, and } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands, llmstxtVersions, subscriptions } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { crawlSite } from "@/lib/crawler";
import { generateLlmsTxt } from "@/lib/retrieval/llmstxt-generator";

export const llmstxtRefreshFn = inngest.createFunction(
  {
    id: "llmstxt-refresh",
    retries: 1,
    triggers: [{ cron: "0 3 1 * *" }],
  },
  async ({ step }: { step: any }) => {
    const allBrands = await step.run("load-brands", async () => {
      return serviceDb
        .select({
          id: brands.id,
          organizationId: brands.organizationId,
          domain: brands.domain,
          name: brands.name,
        })
        .from(brands)
        .innerJoin(subscriptions, eq(subscriptions.organizationId, brands.organizationId))
        .where(eq(subscriptions.status, "active"));
    });

    let refreshedCount = 0;

    for (const brand of allBrands) {
      await step.run(`refresh-${brand.id}`, async () => {
        const crawlResult = await crawlSite(brand.domain, {
          userAgent: "GPTBot/1.1",
          maxPages: 20,
        });

        const result = generateLlmsTxt(brand.name, brand.domain, crawlResult.pages, crawlResult.robotsTxt);

        await serviceDb.transaction(async (tx) => {
          await tx
            .update(llmstxtVersions)
            .set({ isCurrent: false })
            .where(
              and(
                eq(llmstxtVersions.brandId, brand.id),
                eq(llmstxtVersions.isCurrent, true),
              ),
            );

          await tx.insert(llmstxtVersions).values({
            brandId: brand.id,
            organizationId: brand.organizationId,
            content: result.content,
            depthScore: result.depthScore,
            isCurrent: true,
          });
        });

        refreshedCount++;
      });
    }

    return { refreshedBrands: refreshedCount };
  },
);
