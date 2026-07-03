import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brandWebMentions, brands } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import type { MentionSentiment, SourcePlatform } from "@/lib/visibility/types";

export const trackBrandWebMentionsFn = inngest.createFunction(
  {
    id: "track-brand-web-mentions",
    retries: 2,
    triggers: [{ cron: "0 3 * * 1" }],
  },
  async ({ step }: { step: any }) => {
    const allBrands = await step.run("load-brands", async () => {
      return serviceDb
        .select({
          id: brands.id,
          name: brands.name,
          domain: brands.domain,
          organizationId: brands.organizationId,
        })
        .from(brands);
    });

    let totalMentions = 0;

    for (const brand of allBrands) {
      const mentions = await step.run(`scrape-${brand.id}`, async () => {
        return scrapeMentions(brand.name, brand.domain ?? "");
      });

      if (mentions.length > 0) {
        await step.run(`store-${brand.id}`, async () => {
          for (const mention of mentions) {
            await serviceDb.insert(brandWebMentions).values({
              brandId: brand.id,
              organizationId: brand.organizationId,
              marketCode: "AU_EN",
              sourcePlatform: mention.platform,
              sourceUrl: mention.url,
              subreddit: mention.subreddit ?? null,
              mentionText: mention.text ?? null,
              mentionSentiment: mention.sentiment ?? null,
              upvotes: mention.upvotes ?? null,
              isTopComment: mention.isTopComment ?? null,
              threadRecencyDays: mention.threadRecencyDays ?? null,
              isIndexedByGoogle: null,
              engineCitationSeen: null,
              verticalMatch: null,
            });
          }
          totalMentions += mentions.length;
        });
      }
    }

    return { brandsProcessed: allBrands.length, totalMentions };
  },
);

interface ScrapedMention {
  platform: SourcePlatform;
  url: string;
  text?: string;
  sentiment?: MentionSentiment;
  subreddit?: string;
  upvotes?: number;
  isTopComment?: boolean;
  threadRecencyDays?: number;
}

async function scrapeMentions(
  _brandName: string,
  _brandDomain: string,
): Promise<ScrapedMention[]> {
  // Phase A: stub — real scraping implemented in Sprint 5+
  // Returns empty array; the Inngest function structure is in place
  // for when Reddit/YouTube/Quora public surface scraping is enabled.
  return [];
}
