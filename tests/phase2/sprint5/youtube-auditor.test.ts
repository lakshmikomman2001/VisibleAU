import { describe, it, expect } from "vitest";
import { scoreYoutubePresence } from "@/lib/trust/youtube-auditor";

const BASE_INPUT = {
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

describe("scoreYoutubePresence — formula thresholds", () => {
  it("channel absent → score 0", () => {
    const result = scoreYoutubePresence(BASE_INPUT);
    expect(result.presenceScore).toBe(0);
  });

  it("channel exists → 15 (base)", () => {
    const result = scoreYoutubePresence({
      ...BASE_INPUT,
      channelExists: true,
    });
    expect(result.presenceScore).toBeGreaterThanOrEqual(15);
  });

  it("AI citation → +10", () => {
    const withCitation = scoreYoutubePresence({
      ...BASE_INPUT,
      channelExists: true,
      anyVideoCitedInAudit: true,
    });
    const withoutCitation = scoreYoutubePresence({
      ...BASE_INPUT,
      channelExists: true,
      anyVideoCitedInAudit: false,
    });
    expect(withCitation.presenceScore - withoutCitation.presenceScore).toBe(10);
  });

  it("returns gaps for missing items", () => {
    const result = scoreYoutubePresence({
      ...BASE_INPUT,
      channelExists: true,
    });
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});
