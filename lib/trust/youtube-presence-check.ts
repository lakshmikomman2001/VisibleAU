/**
 * Orchestrates the real YouTube presence check: look up the channel
 * (lib/trust/youtube-channel-lookup.ts), score it when (and only when)
 * confirmed (lib/trust/youtube-auditor.ts's scoreYoutubePresenceFromChannel),
 * and shape the result into exactly what
 * db/schema/youtube-presence-audits.ts expects -- the single place the
 * cron and the manual refresh route both call, so they can't drift into
 * two different row shapes.
 *
 * "unconfirmed" rows (a name-only candidate, never domain-corroborated)
 * carry the candidate's identity/stats for display/transparency, but
 * presenceScore stays null -- never scored, never fed into the Overall
 * Trust Score (lib/trust/trust-scorer.ts already excludes a null
 * youtubePresenceScore from the average, same as "unavailable").
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
  checkStatus: "confirmed" | "not_found" | "unconfirmed" | "unavailable";
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
  confirmedChannelUrl?: string | null,
): Promise<YoutubePresenceAuditValues> {
  const outcome = await checkYoutubePresence(brandName, brandDomain, confirmedChannelUrl);

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
      matchConfidence: "0.000",
      checkStatus: "not_found",
      unavailableReason: null,
      presenceScore,
      gaps,
    };
  }

  if (outcome.status === "unconfirmed") {
    // Integrity crux: a name-only candidate is never scored and never
    // fed into the Overall Trust Score (presenceScore stays null, which
    // trust-scorer.ts already treats the same as "no data"). The
    // candidate's identity/stats ARE stored, purely for the
    // confirm/correct UI -- not as a measured result.
    return {
      channelUrl: outcome.candidate.channelUrl,
      channelId: outcome.candidate.channelId,
      channelTitle: outcome.candidate.channelTitle,
      channelExists: null,
      channelSubscriberCount: outcome.candidate.subscriberCount,
      channelTotalVideos: outcome.candidate.videoCount,
      lastUploadAt: null,
      matchConfidence: outcome.matchConfidence.toFixed(3),
      checkStatus: "unconfirmed",
      unavailableReason: null,
      presenceScore: null,
      gaps: [],
    };
  }

  const { channel, confirmedVia } = outcome;
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
    matchConfidence: confirmedVia === "user_url" ? "1.000" : channel.matchConfidence.toFixed(3),
    checkStatus: "confirmed",
    unavailableReason: null,
    presenceScore,
    gaps,
  };
}
