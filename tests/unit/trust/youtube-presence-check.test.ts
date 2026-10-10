/**
 * buildYoutubePresenceAuditRow (the orchestrator both the cron and the
 * manual refresh route call) must never set presenceScore for an
 * "unconfirmed" outcome -- lib/trust/trust-scorer.ts already excludes a
 * null youtubePresenceScore from the Overall Trust Score average, so
 * this is what actually keeps a name-only false match out of the
 * overall.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildYoutubePresenceAuditRow } from "@/lib/trust/youtube-presence-check";

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
  channelId: string;
  title: string;
  description?: string;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string | null;
}) {
  return jsonResponse({
    items: [
      {
        id: opts.channelId,
        snippet: { title: opts.title, description: opts.description ?? "" },
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

describe("buildYoutubePresenceAuditRow -- an unconfirmed candidate is never scored", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("THE GET-PLUMBING CASE end to end: presenceScore is null, checkStatus is 'unconfirmed', the candidate's identity is still stored for the confirm/correct UI", async () => {
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

    const row = await buildYoutubePresenceAuditRow("Bondi Plumbing", "bondiplumbing.com.au");

    expect(row.checkStatus).toBe("unconfirmed");
    expect(row.presenceScore).toBeNull();
    expect(row.channelExists).toBeNull(); // "we don't know" -- not a measured false
    expect(row.channelTitle).toBe("Bondi Plumbing");
    expect(row.channelId).toBe("UC_wrong");
    // Task #37: the reason + conflicting domain must be persisted (via
    // the unconstrained `gaps` jsonb column, no new column) so the UI
    // can render the distinct "different business" copy -- not just
    // discarded after classification.
    expect(row.gaps).toEqual(["domain_mismatch", "getplumbing.com.au"]);
  });

  it("no_domain_signal is persisted distinctly from domain_mismatch (just the reason tag, no domain)", async () => {
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
        playlistItemsResponse([
          { description: "Like and subscribe!", publishedAt: "2020-01-01T00:00:00Z" },
        ]),
      );

    const row = await buildYoutubePresenceAuditRow("Bondi Plumbing", "bondiplumbing.com.au");

    expect(row.checkStatus).toBe("unconfirmed");
    expect(row.presenceScore).toBeNull();
    expect(row.gaps).toEqual(["no_domain_signal"]);
  });

  it("a user-confirmed URL is always scored and marked confirmedVia user_url (matchConfidence 1.000)", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        channelsResponse({
          channelId: "UC_confirmed",
          title: "Fallon Solutions",
          subscriberCount: 500,
          videoCount: 15,
          uploadsPlaylistId: "UU_confirmed",
        }),
      )
      .mockResolvedValueOnce(
        playlistItemsResponse([{ description: "Hi!", publishedAt: "2026-09-15T00:00:00Z" }]),
      );

    const row = await buildYoutubePresenceAuditRow(
      "Fallon Solutions",
      "fallonsolutions.com.au",
      "https://www.youtube.com/channel/UC_confirmed",
    );

    expect(row.checkStatus).toBe("confirmed");
    expect(row.matchConfidence).toBe("1.000");
    expect(row.presenceScore).not.toBeNull();
  });

  it("unavailable is never scored either (presenceScore null)", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");

    const row = await buildYoutubePresenceAuditRow("Any Brand", "anybrand.com.au");

    expect(row.checkStatus).toBe("unavailable");
    expect(row.presenceScore).toBeNull();
  });
});
