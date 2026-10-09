import { serviceDb } from "@/db/client";
import { brands, youtubePresenceAudits } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";
import { buildYoutubePresenceAuditRow } from "@/lib/trust/youtube-presence-check";

export const auditYoutubePresenceFn = inngest.createFunction(
  {
    id: "audit-youtube-presence",
    retries: 2,
    triggers: [{ cron: "0 3 3 * *" }],
  },
  async ({ step }: { step: any }) => {
    // Trust Intelligence honesty pass: kept as a flag-driven gate (not
    // deleted) so a future regression in the real check can be neutralized
    // again instantly by flipping this back to false. See
    // docs/ops/post-launch-db-hardening.md section 34/35.
    if (!TRUST_CHECK_IMPLEMENTED.youtubePresence) {
      return { processed: 0, skipped: "youtubePresence check not yet implemented" };
    }

    const allBrands = await step.run("load-brands", async () => {
      return serviceDb.select().from(brands);
    });

    let processed = 0;

    for (const brand of allBrands) {
      await step.run(`audit-${brand.id}`, async () => {
        // Real YouTube Data API v3 check (lib/trust/youtube-presence-check.ts).
        // Missing key / quota exceeded / network errors are caught inside
        // checkYoutubePresence and returned as an honest "unavailable" row
        // for that brand -- they never throw, so one brand's API trouble
        // never aborts the rest of the run.
        const row = await buildYoutubePresenceAuditRow(brand.name, brand.domain);

        await serviceDb.insert(youtubePresenceAudits).values({
          brandId: brand.id,
          organizationId: brand.organizationId,
          channelUrl: row.channelUrl,
          channelId: row.channelId,
          channelTitle: row.channelTitle,
          channelExists: row.channelExists,
          channelSubscriberCount: row.channelSubscriberCount,
          channelTotalVideos: row.channelTotalVideos,
          lastUploadAt: row.lastUploadAt,
          matchConfidence: row.matchConfidence,
          checkStatus: row.checkStatus,
          unavailableReason: row.unavailableReason,
          citedVideoUrls: [],
          presenceScore: row.presenceScore,
          gaps: row.gaps,
        });

        processed++;
      });
    }

    return { processed };
  },
);
