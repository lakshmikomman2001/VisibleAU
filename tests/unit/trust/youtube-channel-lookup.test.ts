/**
 * Real YouTube Data API v3 check, tightened after a live false match:
 * brand "Bondi Plumbing" matched a channel literally titled "Bondi
 * Plumbing" whose video descriptions linked getplumbing.com.au -- a
 * different company. Name alone is never "confirmed" -- confirmation
 * requires domain corroboration (the brand's own domain mentioned in the
 * channel's description/customUrl/recent video descriptions) or a
 * user-confirmed channel URL/handle.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkYoutubePresence,
  extractDomains,
  MIN_NAME_SIMILARITY_TO_ENRICH,
  resolveChannelByUrlOrHandle,
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
  description?: string;
  customUrl?: string | null;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string | null;
  channelId?: string;
}) {
  return jsonResponse({
    items: [
      {
        id: opts.channelId,
        snippet: {
          title: opts.title,
          description: opts.description ?? "",
          customUrl: opts.customUrl ?? null,
        },
        statistics: {
          subscriberCount: String(opts.subscriberCount),
          videoCount: String(opts.videoCount),
        },
        contentDetails: opts.uploadsPlaylistId
          ? { relatedPlaylists: { uploads: opts.uploadsPlaylistId } }
          : {},
      },
    ],
  });
}

function playlistItemsResponse(items: { description: string; publishedAt: string }[]) {
  return jsonResponse({
    items: items.map((i) => ({ snippet: { description: i.description, publishedAt: i.publishedAt } })),
  });
}

describe("extractDomains -- finds real domains, ignores generic platforms", () => {
  it("extracts a domain from a bare URL in text", () => {
    expect(extractDomains("Visit http://www.getplumbing.com.au/ for a quote")).toContain(
      "getplumbing.com.au",
    );
  });

  it("extracts a domain with no protocol", () => {
    expect(extractDomains("our site is fallonsolutions.com.au")).toContain(
      "fallonsolutions.com.au",
    );
  });

  it("ignores generic platform domains (youtube, social media)", () => {
    const domains = extractDomains(
      "Subscribe on youtube.com! Follow us on facebook.com/us and instagram.com/us",
    );
    expect(domains).toEqual([]);
  });

  it("returns an empty array when no domain is mentioned", () => {
    expect(extractDomains("Thanks for watching, like and subscribe!")).toEqual([]);
  });

  it("normalises scheme+www+trailing-slash, a bare domain, and an in-sentence mention to the same comparable domain", () => {
    const withScheme = extractDomains("Visit http://www.getplumbing.com.au/ to book a quote.");
    const bare = extractDomains("getplumbing.com.au");
    const inSentence = extractDomains(
      "Get Plumbing PTY Ltd based in Chatswood … http://www.getplumbing.com.au/",
    );
    expect(withScheme).toEqual(["getplumbing.com.au"]);
    expect(bare).toEqual(["getplumbing.com.au"]);
    expect(inSentence).toEqual(["getplumbing.com.au"]);
  });

  it("finds multiple distinct real domains", () => {
    const domains = extractDomains("Partner site: partner.com.au. Main site: mainsite.com.au.");
    expect(domains).toContain("partner.com.au");
    expect(domains).toContain("mainsite.com.au");
  });
});

describe("scoreChannelMatch -- name-similarity only (no longer sufficient alone to confirm)", () => {
  it("exact normalized title match scores high but is just a name signal", () => {
    const score = scoreChannelMatch("Bondi Plumbing", "bondiplumbing.com.au", {
      title: "Bondi Plumbing",
      description: "",
    });
    expect(score).toBeGreaterThan(MIN_NAME_SIMILARITY_TO_ENRICH);
  });

  it("a completely unrelated channel scores 0 (not even worth enriching)", () => {
    const score = scoreChannelMatch("Bondi Plumbing", "bondiplumbing.com.au", {
      title: "MrBeast",
      description: "Last to leave wins $500,000.",
    });
    expect(score).toBe(0);
  });
});

describe("checkYoutubePresence -- four honest outcomes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("unavailable: missing_api_key -- never calls fetch at all", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await checkYoutubePresence("Bondi Plumbing", "bondiplumbing.com.au");

    expect(result).toEqual({ status: "unavailable", reason: "missing_api_key" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("THE GET-PLUMBING CASE: an exact-title name match whose video descriptions link a DIFFERENT company's domain is rejected, never scored", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        searchResponse([
          { channelId: "UC_wrong", title: "Bondi Plumbing", description: "Plumbing videos." },
        ]),
      )
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_wrong",
          title: "Bondi Plumbing",
          description: "Your local plumbing experts.",
          subscriberCount: 12,
          videoCount: 8,
          uploadsPlaylistId: "UU_wrong",
        }),
      )
      .mockResolvedValueOnce(
        playlistItemsResponse([
          {
            description: "Call us or visit http://www.getplumbing.com.au/ to book.",
            publishedAt: "2014-01-01T00:00:00Z",
          },
        ]),
      );

    const result = await checkYoutubePresence("Bondi Plumbing", "bondiplumbing.com.au");

    expect(result.status).toBe("unconfirmed");
    if (result.status === "unconfirmed") {
      expect(result.reason).toBe("domain_mismatch");
      expect(result.candidate.channelId).toBe("UC_wrong");
      // Task #37: the actual conflicting domain must be returned, not
      // just the reason tag -- this is what lets the UI say WHICH
      // different business it found, instead of a generic "might be
      // yours".
      expect(result.conflictingDomain).toBe("getplumbing.com.au");
    }
  });

  it("the exact live text (with an ellipsis and scheme+www+trailing-slash URL) is parsed correctly", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        searchResponse([
          { channelId: "UC_wrong", title: "Bondi Plumbing", description: "Plumbing videos." },
        ]),
      )
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_wrong",
          title: "Bondi Plumbing",
          description: "",
          subscriberCount: 2,
          videoCount: 1,
          uploadsPlaylistId: "UU_wrong",
        }),
      )
      .mockResolvedValueOnce(
        playlistItemsResponse([
          {
            description: "Get Plumbing PTY Ltd based in Chatswood … http://www.getplumbing.com.au/",
            publishedAt: "2014-07-31T00:00:00Z",
          },
        ]),
      );

    const result = await checkYoutubePresence("Bondi Plumbing", "bondiplumbing.com.au");

    expect(result.status).toBe("unconfirmed");
    if (result.status === "unconfirmed") {
      expect(result.reason).toBe("domain_mismatch");
      expect(result.conflictingDomain).toBe("getplumbing.com.au");
    }
  });

  it("no domain signal either way -> unconfirmed (name-only, not enough to trust)", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        searchResponse([
          { channelId: "UC_maybe", title: "Bondi Plumbing", description: "Plumbing videos." },
        ]),
      )
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_maybe",
          title: "Bondi Plumbing",
          description: "Thanks for watching!",
          subscriberCount: 5,
          videoCount: 2,
          uploadsPlaylistId: "UU_maybe",
        }),
      )
      .mockResolvedValueOnce(
        playlistItemsResponse([{ description: "Like and subscribe!", publishedAt: "2020-01-01T00:00:00Z" }]),
      );

    const result = await checkYoutubePresence("Bondi Plumbing", "bondiplumbing.com.au");

    expect(result.status).toBe("unconfirmed");
    if (result.status === "unconfirmed") {
      expect(result.reason).toBe("no_domain_signal");
      expect(result.conflictingDomain).toBeNull();
    }
  });

  it("confirmed: the brand's own domain corroborated in the channel description", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        searchResponse([
          { channelId: "UC_fallon", title: "Fallon Solutions", description: "Brisbane plumbers." },
        ]),
      )
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_fallon",
          title: "Fallon Solutions",
          description: "Visit fallonsolutions.com.au to book a service.",
          subscriberCount: 5000,
          videoCount: 120,
          uploadsPlaylistId: "UU_fallon",
        }),
      )
      .mockResolvedValueOnce(
        playlistItemsResponse([
          { description: "Thanks for watching!", publishedAt: "2026-09-15T00:00:00Z" },
        ]),
      );

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result.status).toBe("confirmed");
    if (result.status === "confirmed") {
      expect(result.confirmedVia).toBe("domain");
      expect(result.channel.subscriberCount).toBe(5000);
    }
  });

  it("confirmed: the brand's domain corroborated in a recent VIDEO description, not the channel description itself", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        searchResponse([
          { channelId: "UC_fallon", title: "Fallon Solutions", description: "Brisbane plumbers." },
        ]),
      )
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_fallon",
          title: "Fallon Solutions",
          description: "Thanks for watching!",
          subscriberCount: 5000,
          videoCount: 120,
          uploadsPlaylistId: "UU_fallon",
        }),
      )
      .mockResolvedValueOnce(
        playlistItemsResponse([
          { description: "Book online at fallonsolutions.com.au", publishedAt: "2026-09-15T00:00:00Z" },
        ]),
      );

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result.status).toBe("confirmed");
  });

  it("not_found: zero search results", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(searchResponse([]));

    const result = await checkYoutubePresence("Bondi Plumbing", "bondiplumbing.com.au");

    expect(result).toEqual({ status: "not_found" });
  });

  it("not_found: the top candidate has zero name relevance -- never enriched", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      searchResponse([
        { channelId: "UC_unrelated", title: "MrBeast", description: "Last to leave wins $500,000." },
      ]),
    );

    const result = await checkYoutubePresence("Bondi Plumbing", "bondiplumbing.com.au");

    expect(result.status).toBe("not_found");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // only the search call, never enriched
  });

  it("unavailable: quota_exceeded on the search call", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403),
    );

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result).toEqual({ status: "unavailable", reason: "quota_exceeded" });
  });

  it("unavailable: network_error on the search call", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network failure"));

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result).toEqual({ status: "unavailable", reason: "network_error" });
  });

  it("a failed video-descriptions fetch degrades gracefully -- the channel description alone can still confirm", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        searchResponse([
          { channelId: "UC_fallon", title: "Fallon Solutions", description: "Brisbane plumbers." },
        ]),
      )
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_fallon",
          title: "Fallon Solutions",
          description: "Visit fallonsolutions.com.au to book.",
          subscriberCount: 5000,
          videoCount: 120,
          uploadsPlaylistId: "UU_fallon",
        }),
      )
      .mockRejectedValueOnce(new Error("playlistItems failed"));

    const result = await checkYoutubePresence("Fallon Solutions", "fallonsolutions.com.au");

    expect(result.status).toBe("confirmed");
    if (result.status === "confirmed") expect(result.channel.lastUploadAt).toBeNull();
  });

  it("a user-confirmed channel URL always wins -- resolved directly, skips the fuzzy search entirely", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_confirmed",
          title: "Fallon Solutions (Official)",
          subscriberCount: 5000,
          videoCount: 120,
          uploadsPlaylistId: "UU_confirmed",
        }),
      )
      .mockResolvedValueOnce(
        playlistItemsResponse([{ description: "Hi!", publishedAt: "2026-09-15T00:00:00Z" }]),
      );

    const result = await checkYoutubePresence(
      "Fallon Solutions",
      "fallonsolutions.com.au",
      "https://www.youtube.com/channel/UC_confirmed",
    );

    expect(result.status).toBe("confirmed");
    if (result.status === "confirmed") {
      expect(result.confirmedVia).toBe("user_url");
      expect(result.channel.matchConfidence).toBe(1);
    }
    // Only channels.list + playlistItems.list -- no search.list call at all.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain("/search?");
  });
});

describe("resolveChannelByUrlOrHandle -- parses the common URL/handle forms", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a /channel/<id> URL via channels.list?id=", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_abc",
          title: "Some Channel",
          subscriberCount: 10,
          videoCount: 1,
          uploadsPlaylistId: null,
        }),
      );

    const result = await resolveChannelByUrlOrHandle(
      "https://www.youtube.com/channel/UC_abc",
      "test-key",
    );

    expect(result && "channelId" in result ? result.channelId : null).toBe("UC_abc");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("id=UC_abc");
  });

  it("resolves an @handle URL via channels.list?forHandle=", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      channelsResponse({
        channelId: "UC_xyz",
        title: "Some Channel",
        subscriberCount: 10,
        videoCount: 1,
        uploadsPlaylistId: null,
      }),
    );

    const result = await resolveChannelByUrlOrHandle(
      "https://www.youtube.com/@somechannel",
      "test-key",
    );

    expect(result && "channelId" in result ? result.channelId : null).toBe("UC_xyz");
  });

  it("resolves a bare @handle (no URL)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      channelsResponse({
        channelId: "UC_xyz",
        title: "Some Channel",
        subscriberCount: 10,
        videoCount: 1,
        uploadsPlaylistId: null,
      }),
    );

    const result = await resolveChannelByUrlOrHandle("@somechannel", "test-key");

    expect(result && "channelId" in result ? result.channelId : null).toBe("UC_xyz");
  });

  it("returns null (not unavailable) for an unsupported legacy /c/ URL -- the input was the problem, not the API", async () => {
    const result = await resolveChannelByUrlOrHandle(
      "https://www.youtube.com/c/legacyname",
      "test-key",
    );

    expect(result).toBeNull();
  });
});
