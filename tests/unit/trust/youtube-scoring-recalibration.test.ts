/**
 * Live testing found a confirmed-but-dormant channel (0 subscribers, 1
 * video, last upload 12 years ago) scored 40/100 "Medium" purely because
 * "channel exists" alone was worth 40 of the old formula's 100 points.
 * Recalibrated so existence barely registers (10) and real activity
 * (subscribers, video count, recency) carries the score.
 */
import { describe, expect, it } from "vitest";
import { scoreYoutubePresenceFromChannel } from "@/lib/trust/youtube-auditor";

function scoreLevel(score: number): "Low" | "Medium" | "High" {
  return score <= 33 ? "Low" : score <= 66 ? "Medium" : "High";
}

describe("scoreYoutubePresenceFromChannel -- recalibrated so existence doesn't dominate", () => {
  it("THE LIVE DORMANT CASE: 0 subs, 1 video, last upload 12 years ago -> Low (was 40/Medium)", () => {
    const result = scoreYoutubePresenceFromChannel({
      channelExists: true,
      subscriberCount: 0,
      videoCount: 1,
      daysSinceLastUpload: 12 * 365,
    });

    expect(result.presenceScore).toBe(10);
    expect(scoreLevel(result.presenceScore)).toBe("Low");
  });

  it("no channel at all -> 0, Low", () => {
    const result = scoreYoutubePresenceFromChannel({
      channelExists: false,
      subscriberCount: 0,
      videoCount: 0,
      daysSinceLastUpload: null,
    });
    expect(result.presenceScore).toBe(0);
  });

  it("a real, active channel (500 subs, 15 videos, uploaded 30 days ago) -> High", () => {
    const result = scoreYoutubePresenceFromChannel({
      channelExists: true,
      subscriberCount: 500,
      videoCount: 15,
      daysSinceLastUpload: 30,
    });

    expect(result.presenceScore).toBe(70);
    expect(scoreLevel(result.presenceScore)).toBe("High");
  });

  it("a modest, somewhat-active channel (150 subs, 4 videos, uploaded 100 days ago) -> Medium", () => {
    const result = scoreYoutubePresenceFromChannel({
      channelExists: true,
      subscriberCount: 150,
      videoCount: 4,
      daysSinceLastUpload: 100,
    });

    expect(result.presenceScore).toBe(40);
    expect(scoreLevel(result.presenceScore)).toBe("Medium");
  });

  it("existence alone (0 subs, 0 videos, unknown recency) no longer dominates -> Low, not Medium", () => {
    const result = scoreYoutubePresenceFromChannel({
      channelExists: true,
      subscriberCount: 0,
      videoCount: 0,
      daysSinceLastUpload: null,
    });

    expect(result.presenceScore).toBe(10);
    expect(scoreLevel(result.presenceScore)).toBe("Low");
  });

  it("a top-tier channel (10k subs, 50 videos, uploaded yesterday) maxes out at 100", () => {
    const result = scoreYoutubePresenceFromChannel({
      channelExists: true,
      subscriberCount: 10000,
      videoCount: 50,
      daysSinceLastUpload: 1,
    });

    expect(result.presenceScore).toBe(100);
  });
});
