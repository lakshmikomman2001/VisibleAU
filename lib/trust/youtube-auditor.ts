/**
 * Trust Intelligence honesty pass: `scoreYoutubePresence` below was the
 * stub-era scorer -- most of its inputs (longformVideoCount,
 * howtoVideoCount, videosWithChapters, embeddingPages*, etc.) require
 * either a content-classification pass or a crawl of the brand's own
 * website, neither of which the YouTube Data API v3 provides. Rather
 * than fabricate those inputs, the real check scores only what the API
 * actually measures: does a channel exist, how large is its audience,
 * how much content does it have, and is it still active.
 *
 * Recalibrated (live testing found a confirmed-but-dormant channel --
 * 0 subscribers, 1 video, last upload 12 years ago -- scored 40/100
 * "Medium" purely because "channel exists" alone was worth 40. Existence
 * now barely registers; real activity carries the score):
 *   - channel exists:        10 (foundational only -- confirms there's
 *                                something to measure, not that it's any
 *                                good)
 *   - subscribers >= 1000:   +30 ; >= 100: +15 ; else +0
 *   - total videos >= 20:    +30 ; >= 5:   +15 ; else +0
 *   - last upload <= 90d:    +30 ; <= 365d: +15 ; else +0 (stale/unknown)
 * Max 100. Validated against the live dormant case: 10+0+0+0 = 10 -> Low
 * (was 40 -> "Medium"). A channel with real activity (e.g. 500 subs, 15
 * videos, upload 30 days ago) scores 10+15+15+30 = 70 -> High; a more
 * modest one (150 subs, 4 videos, upload 100 days ago) scores
 * 10+15+0+15 = 40 -> Medium. These thresholds are proposed, not
 * validated against a large sample of real channels -- reasonable
 * starting points, not holy writ. See
 * docs/ops/post-launch-db-hardening.md section 36.
 */
export interface YoutubeChannelScoreInput {
  channelExists: boolean;
  subscriberCount: number;
  videoCount: number;
  /** null when recency is unknown (the enrich step degraded gracefully) -- scored as stale, not penalised further than that. */
  daysSinceLastUpload: number | null;
}

export interface YoutubeChannelScoreResult {
  presenceScore: number;
  gaps: string[];
}

export function scoreYoutubePresenceFromChannel(
  input: YoutubeChannelScoreInput,
): YoutubeChannelScoreResult {
  if (!input.channelExists) {
    return {
      presenceScore: 0,
      gaps: ["No YouTube channel found — create one and add your channel URL to your brand profile."],
    };
  }

  const gaps: string[] = [];
  let score = 10;

  if (input.subscriberCount >= 1000) {
    score += 30;
  } else if (input.subscriberCount >= 100) {
    score += 15;
  } else {
    gaps.push(`Only ${input.subscriberCount} subscribers — grow the audience for stronger authority signals.`);
  }

  if (input.videoCount >= 20) {
    score += 30;
  } else if (input.videoCount >= 5) {
    score += 15;
  } else {
    gaps.push(`Only ${input.videoCount} videos published — more content gives AI engines more to cite.`);
  }

  if (input.daysSinceLastUpload !== null && input.daysSinceLastUpload <= 90) {
    score += 30;
  } else if (input.daysSinceLastUpload !== null && input.daysSinceLastUpload <= 365) {
    score += 15;
  } else {
    gaps.push("No recent uploads — an active channel signals current relevance to AI crawlers.");
  }

  return { presenceScore: score, gaps };
}

export interface YoutubePresenceInput {
  channelExists: boolean;
  channelSubscriberCount: number;
  channelTotalVideos: number;
  longformVideoCount: number;
  shortsCount: number;
  howtoVideoCount: number;
  explainerVideoCount: number;
  brandTopicVideoCount: number;
  videosWithTranscript: number;
  videosWithChapters: number;
  avgChapterCount: number;
  avgDescriptionLength: number;
  embeddingPagesCount: number;
  embeddingPagesWithSchema: number;
  embeddingPagesWithTranscript: number;
  anyVideoCitedInAudit: boolean;
}

export interface YoutubePresenceResult {
  presenceScore: number;
  longformRatio: number;
  gaps: string[];
}

export function scoreYoutubePresence(input: YoutubePresenceInput): YoutubePresenceResult {
  const gaps: string[] = [];
  const totalVideos = input.longformVideoCount + input.shortsCount;
  const longformRatio =
    totalVideos > 0 ? Math.round((input.longformVideoCount / totalVideos) * 1000) / 1000 : 0;

  if (!input.channelExists) {
    gaps.push(
      "No YouTube channel found — create one and add your channel URL to your brand profile.",
    );
    return { presenceScore: 0, longformRatio: 0, gaps };
  }

  let score = 0;

  // Channel existence (max 15)
  score += 15;

  // Content volume (max 20)
  if (longformRatio >= 0.7) {
    score += 10;
  } else {
    gaps.push(
      `Long-form ratio is ${(longformRatio * 100).toFixed(0)}% — target 70%+ (long-form drives 94% of AI citations).`,
    );
  }

  if (input.howtoVideoCount >= 3) {
    score += 10;
  } else {
    gaps.push(
      `Only ${input.howtoVideoCount} how-to videos — create at least 3 for strong citation signals.`,
    );
  }

  // Transcript/chapter quality (max 35)
  if (input.videosWithChapters >= 3) {
    score += 15;
  } else {
    gaps.push(
      `Only ${input.videosWithChapters} videos have chapters — add timestamps to at least 3 videos.`,
    );
  }

  if (input.avgChapterCount >= 5) {
    score += 10;
  } else {
    gaps.push(
      `Average chapter count is ${input.avgChapterCount.toFixed(1)} — target at least 5 chapters per video.`,
    );
  }

  if (input.videosWithTranscript >= 2) {
    score += 10;
  } else {
    gaps.push("Add transcripts to at least 2 videos for improved AI discoverability.");
  }

  // Embedding + schema (max 20)
  if (input.embeddingPagesCount >= 1) {
    score += 10;
  } else {
    gaps.push("No pages embed your YouTube videos — embed videos on relevant website pages.");
  }

  if (input.embeddingPagesWithSchema >= 1) {
    score += 10;
  } else {
    gaps.push(
      "No embedding pages have VideoObject schema — add structured data to pages with embedded videos.",
    );
  }

  // AI citation signal (max 10)
  if (input.anyVideoCitedInAudit) {
    score += 10;
  } else {
    gaps.push(
      "No videos cited in recent audits — focus on chaptered, transcribed how-to content in your brand's topic area.",
    );
  }

  return { presenceScore: score, longformRatio, gaps };
}
