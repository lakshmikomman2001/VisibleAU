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

export function scoreYoutubePresence(
  input: YoutubePresenceInput,
): YoutubePresenceResult {
  const gaps: string[] = [];
  const totalVideos = input.longformVideoCount + input.shortsCount;
  const longformRatio = totalVideos > 0
    ? Math.round((input.longformVideoCount / totalVideos) * 1000) / 1000
    : 0;

  if (!input.channelExists) {
    gaps.push("No YouTube channel found — create one and add your channel URL to your brand profile.");
    return { presenceScore: 0, longformRatio: 0, gaps };
  }

  let score = 0;

  // Channel existence (max 15)
  score += 15;

  // Content volume (max 20)
  if (longformRatio >= 0.70) {
    score += 10;
  } else {
    gaps.push(`Long-form ratio is ${(longformRatio * 100).toFixed(0)}% — target 70%+ (long-form drives 94% of AI citations).`);
  }

  if (input.howtoVideoCount >= 3) {
    score += 10;
  } else {
    gaps.push(`Only ${input.howtoVideoCount} how-to videos — create at least 3 for strong citation signals.`);
  }

  // Transcript/chapter quality (max 35)
  if (input.videosWithChapters >= 3) {
    score += 15;
  } else {
    gaps.push(`Only ${input.videosWithChapters} videos have chapters — add timestamps to at least 3 videos.`);
  }

  if (input.avgChapterCount >= 5) {
    score += 10;
  } else {
    gaps.push(`Average chapter count is ${input.avgChapterCount.toFixed(1)} — target at least 5 chapters per video.`);
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
    gaps.push("No embedding pages have VideoObject schema — add structured data to pages with embedded videos.");
  }

  // AI citation signal (max 10)
  if (input.anyVideoCitedInAudit) {
    score += 10;
  } else {
    gaps.push("No videos cited in recent audits — focus on chaptered, transcribed how-to content in your brand's topic area.");
  }

  return { presenceScore: score, longformRatio, gaps };
}
