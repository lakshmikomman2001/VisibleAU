import { serviceDb } from "@/db/client";
import { brands, youtubePresenceAudits } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { scoreYoutubePresence } from "@/lib/trust/youtube-auditor";

export const auditYoutubePresenceFn = inngest.createFunction(
  {
    id: "audit-youtube-presence",
    retries: 2,
    triggers: [{ cron: "0 3 3 * *" }],
  },
  async ({ step }: { step: any }) => {
    const allBrands = await step.run("load-brands", async () => {
      return serviceDb.select().from(brands);
    });

    let processed = 0;

    for (const brand of allBrands) {
      await step.run(`audit-${brand.id}`, async () => {
        const input = {
          channelExists: false,
          channelSubscriberCount: 0,
          channelTotalVideos: 0,
          longformVideoCount: 0,
          shortsCount: 0,
          howtoVideoCount: 0,
          explainerVideoCount: 0,
          brandTopicVideoCount: 0,
          videosWithTranscript: 0,
          videosWithChapters: 0,
          avgChapterCount: 0,
          avgDescriptionLength: 0,
          embeddingPagesCount: 0,
          embeddingPagesWithSchema: 0,
          embeddingPagesWithTranscript: 0,
          anyVideoCitedInAudit: false,
        };

        if (process.env.LLM_MODE !== "mock" && process.env.YOUTUBE_API_KEY) {
          // YouTube Data API v3 integration
          // Step 1: channels?part=snippet,statistics&forHandle={handle}
          // Step 2: playlistItems for uploads
          // Step 3: videos?part=snippet,contentDetails batch
          // Step 4: Check embedding pages for VideoObject schema
          // TODO: implement YouTube API integration in production
        }

        const result = scoreYoutubePresence(input);

        await serviceDb.insert(youtubePresenceAudits).values({
          brandId: brand.id,
          organizationId: brand.organizationId,
          channelUrl: null,
          channelExists: input.channelExists,
          channelSubscriberCount: input.channelSubscriberCount,
          channelTotalVideos: input.channelTotalVideos,
          longformVideoCount: input.longformVideoCount,
          shortsCount: input.shortsCount,
          longformRatio: String(result.longformRatio),
          howtoVideoCount: input.howtoVideoCount,
          explainerVideoCount: input.explainerVideoCount,
          brandTopicVideoCount: input.brandTopicVideoCount,
          videosWithTranscript: input.videosWithTranscript,
          videosWithChapters: input.videosWithChapters,
          avgChapterCount: String(input.avgChapterCount),
          avgDescriptionLength: input.avgDescriptionLength,
          embeddingPagesCount: input.embeddingPagesCount,
          embeddingPagesWithSchema: input.embeddingPagesWithSchema,
          embeddingPagesWithTranscript: input.embeddingPagesWithTranscript,
          anyVideoCitedInAudit: input.anyVideoCitedInAudit,
          citedVideoUrls: [],
          presenceScore: result.presenceScore,
          gaps: result.gaps,
        });

        processed++;
      });
    }

    return { processed };
  },
);
