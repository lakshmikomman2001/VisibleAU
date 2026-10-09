/**
 * Real YouTube Data API v3 check. Integrity crux: never claim a channel
 * is the brand's without a confident match -- a wrong match is a
 * fabrication, the exact class the Trust honesty pass has been killing.
 * Three honest, distinct outcomes: "confirmed" (above
 * MATCH_CONFIDENCE_THRESHOLD), "not_found" (checked, no confident
 * candidate -- a real measured result), "unavailable" (couldn't check at
 * all -- missing key / quota / network error -- never a fabricated 0).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkYoutubePresence,
  MATCH_CONFIDENCE_THRESHOLD,
  scoreChannelMatch,
} from "@/lib/trust/youtube-channel-lookup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function searchResponse(items: { channelId: string; title: string; description: string }[]) {
  return jsonResponse({
    items: items.map((i) => ({
      id: { channelId: i.channelId },
      snippet: { title: i.title, description: i.description },
    })),
  });
}

function channelsResponse(opts: {
  title: string;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string;
}) {
  return jsonResponse({
    items: [
      {
        snippet: { title: opts.title },
        statistics: {
          subscriberCount: String(opts.subscriberCount),
          videoCount: String(opts.videoCount),
        },
        contentDetails: { relatedPlaylists: { uploads: opts.uploadsPlaylistId } },
      },
    ],
  });
}

function playlistItemsResponse(publishedAt: string) {
  return jsonResponse({ items: [{ snippet: { publishedAt } }] });
}

describe("scoreChannelMatch -- pure matching logic", () => {
  it("exact normalized title match alone clears the threshold", () => {
    const score = scoreChannelMatch("Fallon Solutions", "fallonsolutions.com.au", {
      title: "Fallon Solutions",
      description: "",
    });
    expect(score).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_THRESHOLD);
  });

  it("a weak title substring alone does NOT clear the threshold", () => {
    const score = scoreChannelMatch("Fallon Solutions", "fallonsolutions.com.au", {
      title: "Fallon Solutions Reviews Channel",
      description: "A completely unrelated description.",
    });
    expect(score).toBeLessThan(MATCH_CONFIDENCE_THRESHOLD);
  });

  it("a weak title substring PLUS the domain root in the description together clear the threshold", () => {
    const score = scoreChannelMatch("Fallon Solutions", "fallonsolutions.com.au", {
      title: "Fallon Solutions Reviews Channel",
      description: "Visit fallonsolutions.com.au for more plumbing tips.",
    });
    expect(score).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_THRESHOLD);
  });

  it("a completely unrelated channel scores 0", () => {
    const score = scoreChannelMatch("Fallon Solutions", "fallonsolutions.com.au", {
      title: "MrBeast",
      description: "Last to leave wins $500,000.",
    });
    expect(score).toBe(0);
  });
});

describe("checkYoutubePresence -- three honest outcomes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("unavailable: missing_api_key -- never calls fetch at all", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result).toEqual({ status: "unavailable", reason: "missing_api_key" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("confirmed: an exact-title match is enriched with real stats and a recency date", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        searchResponse([
          { channelId: "UC_fallon", title: "Fallon Solutions", description: "Brisbane plumbers." },
        ]),
      )
      .mockResolvedValueOnce(
        channelsResponse({
          title: "Fallon Solutions",
          subscriberCount: 5000,
          videoCount: 120,
          uploadsPlaylistId: "UU_fallon",
        }),
      )
      .mockResolvedValueOnce(playlistItemsResponse("2026-09-15T00:00:00Z"));

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result.status).toBe("confirmed");
    if (result.status === "confirmed") {
      expect(result.channel.channelId).toBe("UC_fallon");
      expect(result.channel.channelUrl).toBe("https://www.youtube.com/channel/UC_fallon");
      expect(result.channel.subscriberCount).toBe(5000);
      expect(result.channel.videoCount).toBe(120);
      expect(result.channel.lastUploadAt).toBe("2026-09-15T00:00:00Z");
      expect(result.channel.matchConfidence).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_THRESHOLD);
    }
  });

  it("not_found: zero search results -- a real measured absence, not an error", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(searchResponse([]));

    const result = await checkYoutubePresence("Bondi Plumbing", "bondiplumbing.com.au");

    expect(result).toEqual({ status: "not_found", bestCandidateConfidence: 0 });
  });

  it("not_found: a clearly-wrong candidate (name mismatch) is NOT claimed as the brand's channel", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      searchResponse([
        { channelId: "UC_unrelated", title: "MrBeast", description: "Last to leave wins $500,000." },
      ]),
    );

    const result = await checkYoutubePresence("Bondi Plumbing", "bondiplumbing.com.au");

    expect(result.status).toBe("not_found");
    // Only ONE fetch call (search) -- never enriched a channel it didn't
    // confidently match (no channels.list call for the wrong candidate).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("unavailable: quota_exceeded -- a 403 quotaExceeded is never presented as a measured 0", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403),
    );

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result).toEqual({ status: "unavailable", reason: "quota_exceeded" });
  });

  it("unavailable: network_error -- a thrown fetch error is never presented as a measured 0", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network failure"));

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result).toEqual({ status: "unavailable", reason: "network_error" });
  });

  it("confirmed, but recency lookup fails: the match still stands, lastUploadAt is just null (graceful degradation)", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        searchResponse([
          { channelId: "UC_fallon", title: "Fallon Solutions", description: "Brisbane plumbers." },
        ]),
      )
      .mockResolvedValueOnce(
        channelsResponse({
          title: "Fallon Solutions",
          subscriberCount: 5000,
          videoCount: 120,
          uploadsPlaylistId: "UU_fallon",
        }),
      )
      .mockRejectedValueOnce(new Error("playlistItems failed"));

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result.status).toBe("confirmed");
    if (result.status === "confirmed") {
      expect(result.channel.lastUploadAt).toBeNull();
      expect(result.channel.subscriberCount).toBe(5000);
    }
  });
});
