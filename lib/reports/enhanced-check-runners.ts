import { withRlsContext } from "@/db/client";
import { youtubePresenceAudits } from "@/db/schema";
import { runTechnicalAuditInline } from "@/lib/audit/run-technical-audit-inline";
import { buildYoutubePresenceAuditRow } from "@/lib/trust/youtube-presence-check";
import type { BeyondAiBrand } from "./beyond-ai";
import type { EnhancedRunners } from "./enhanced-refresh";

/**
 * S01 part 9 (LLD 8.1.7, D-RT4): the existing checks an Enhanced report re-runs, writing their results where they always
 * do (so the audit page, the next report and the panel's list see them too). Both fetch customer sites only through
 * S00B's guarded fetcher, inside the functions they call; neither adds a fetch of its own.
 * - site: the existing technical audit runner (lib/audit/run-technical-audit-inline.ts) with no audit -- robots.txt for
 *   AI crawler access, the ABR lookup with the GUID for identity (abn-lookup.ts), and the technical score. It doesn't
 *   emit technical-audit/complete, so a report's refresh starts none of that event's follow-up jobs.
 * - youtube: the existing presence check for the brand's linked channel (lib/trust/youtube-presence-check.ts), stored
 *   as the monthly cron stores it, under the workspace's RLS context.
 */
export function enhancedRunners(organizationId: string): EnhancedRunners {
  return {
    site: (brand: BeyondAiBrand) =>
      runTechnicalAuditInline(null, brand.id, { emitComplete: false }),
    youtube: async (brand: BeyondAiBrand) => {
      const row = await buildYoutubePresenceAuditRow(
        brand.name,
        brand.domain,
        brand.youtubeChannelUrl,
      );
      await withRlsContext(organizationId, (tx) =>
        tx.insert(youtubePresenceAudits).values({
          brandId: brand.id,
          organizationId,
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
        }),
      );
    },
  };
}
