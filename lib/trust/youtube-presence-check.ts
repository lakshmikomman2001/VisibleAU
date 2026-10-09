/**
 * Orchestrates the real YouTube presence check: look up the channel
 * (lib/trust/youtube-channel-lookup.ts), score it
 * (lib/trust/youtube-auditor.ts's scoreYoutubePresenceFromChannel), and
 * shape the result into exactly what db/schema/youtube-presence-audits.ts
 * expects -- the single place the cron and the manual refresh route both
 * call, so they can't drift into two different row shapes.
 */
import { checkYoutubePresence } from "./youtube-channel-lookup";
import { scoreYoutubePresenceFromChannel } from "./youtube-auditor";

export interface YoutubePresenceAuditValues {
  channelUrl: string | null;
  channelId: string | null;
  channelTitle: string | null;
  channelExists: boolean | null;
  channelSubscriberCount: number | null;
  channelTotalVideos: number | null;
  lastUploadAt: Date | null;
  matchConfidence: string | null;
  checkStatus: "confirmed" | "not_found" | "unavailable";
  unavailableReason: "missing_api_key" | "quota_exceeded" | "network_error" | null;
  presenceScore: number | null;
  gaps: string[];
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export async function buildYoutubePresenceAuditRow(
  brandName: string,
  brandDomain: string,
): Promise<YoutubePresenceAuditValues> {
  const outcome = await checkYoutubePresence(brandName, brandDomain);

  if (outcome.status === "unavailable") {
    return {
      channelUrl: null,
      channelId: null,
      channelTitle: null,
      channelExists: null,
      channelSubscriberCount: null,
      channelTotalVideos: null,
      lastUploadAt: null,
      matchConfidence: null,
      checkStatus: "unavailable",
      unavailableReason: outcome.reason,
      presenceScore: null,
      gaps: [],
    };
  }

  if (outcome.status === "not_found") {
    const { presenceScore, gaps } = scoreYoutubePresenceFromChannel({
      channelExists: false,
      subscriberCount: 0,
      videoCount: 0,
      daysSinceLastUpload: null,
    });
    return {
      channelUrl: null,
      channelId: null,
      channelTitle: null,
      channelExists: false,
      channelSubscriberCount: null,
      channelTotalVideos: null,
      lastUploadAt: null,
      matchConfidence: outcome.bestCandidateConfidence.toFixed(3),
      checkStatus: "not_found",
      unavailableReason: null,
      presenceScore,
      gaps,
    };
  }

  const { channel } = outcome;
  const lastUploadDate = channel.lastUploadAt ? new Date(channel.lastUploadAt) : null;
  const daysSinceLastUpload = lastUploadDate ? daysBetween(lastUploadDate, new Date()) : null;
  const { presenceScore, gaps } = scoreYoutubePresenceFromChannel({
    channelExists: true,
    subscriberCount: channel.subscriberCount,
    videoCount: channel.videoCount,
    daysSinceLastUpload,
  });

  return {
    channelUrl: channel.channelUrl,
    channelId: channel.channelId,
    channelTitle: channel.channelTitle,
    channelExists: true,
    channelSubscriberCount: channel.subscriberCount,
    channelTotalVideos: channel.videoCount,
    lastUploadAt: lastUploadDate,
    matchConfidence: channel.matchConfidence.toFixed(3),
    checkStatus: "confirmed",
    unavailableReason: null,
    presenceScore,
    gaps,
  };
}
