/**
 * S01 part 9 (LLD 8.1.7 "Enhanced checks before rendering", D-RT4; contract P08.checks): with a fixed clock,
 * - the windows: identity 30 days, AI crawler access 7, YouTube 7 (only when a channel is linked and the check is
 *   enabled), technical 30; only checks older than their window run again;
 * - the refresh runs the site checks once for identity, crawler access and technical together, YouTube on its own;
 *   nothing runs when every check is fresh;
 * - a check that times out, or finishes without a newer result, prints "Couldn't check on {date}: {reason}" and the
 *   report still has every tile; a check that wrote a result keeps that result's tile;
 * - the panel's status lines.
 */
import { describe, expect, it, vi } from "vitest";
import type { BeyondAiAnswers } from "@/lib/reports/beyond-ai";
import {
  applyRefreshOutcomes,
  checkStatusLine,
  planEnhancedChecks,
  REFRESH_DIDNT_COMPLETE,
  REFRESH_TIMED_OUT,
} from "@/lib/reports/enhanced-checks";
import { refreshEnhancedChecks } from "@/lib/reports/enhanced-refresh";

const NOW = new Date("2026-11-23T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const tile = (checkedAt: string | null) => ({
  status: "measured" as const,
  checkedAt,
  stale: false,
  failure: null,
});

function beyond(dates: {
  identity: string | null;
  youtube: string | null;
  crawlers: string | null;
  technical: string | null;
  youtubeState?: "found" | "not_linked";
}): BeyondAiAnswers {
  return {
    asOf: NOW.toISOString(),
    identity: {
      ...tile(dates.identity),
      abnOnFile: true,
      abn: "51824753605",
      abnStatus: "Active",
      abnVerified: true,
      entity: "QUOLLEN GROUP PTY LTD",
      auDomain: true,
      wikipedia: false,
    },
    youtube: {
      ...tile(dates.youtube),
      state: dates.youtubeState ?? "found",
      channelTitle: "NumbaTek IT",
      videos: 4,
      lastUploadAt: null,
    },
    crawlers: {
      ...tile(dates.crawlers),
      searchAllowed: ["OAI-SearchBot"],
      searchBlocked: [],
      total: 4,
      visits: { status: "not_measured", total: 0, byCrawler: [] },
    },
    technical: { ...tile(dates.technical), score: 40, max: 74, scoringVersion: 4, weakest: [] },
    directories: null,
  };
}

const BRAND = {
  id: "b1",
  name: "NumbaTek IT",
  domain: "numbatekit.com.au",
  region: "au",
  categories: [],
  abn: "51824753605",
  youtubeChannelUrl: "https://www.youtube.com/@numbatekit",
};

describe("the windows (D-RT4)", () => {
  it("re-runs only checks older than their window", () => {
    const plan = planEnhancedChecks(
      beyond({
        identity: daysAgo(29),
        youtube: daysAgo(8),
        crawlers: daysAgo(6),
        technical: daysAgo(31),
      }),
      NOW,
      { youtubeEnabled: true },
    );
    expect(plan.map((r) => [r.check, r.decision])).toEqual([
      ["identity", "reuse"],
      ["youtube", "run"],
      ["crawlers", "reuse"],
      ["technical", "run"],
    ]);
  });

  it("a check never run runs; YouTube with no channel or switched off never runs", () => {
    const fresh = { identity: null, youtube: null, crawlers: daysAgo(1), technical: daysAgo(1) };
    expect(planEnhancedChecks(beyond(fresh), NOW, { youtubeEnabled: true })[0].decision).toBe(
      "run",
    );
    expect(
      planEnhancedChecks(beyond({ ...fresh, youtubeState: "not_linked" }), NOW, {
        youtubeEnabled: true,
      })[1].decision,
    ).toBe("not_linked");
    expect(planEnhancedChecks(beyond(fresh), NOW, { youtubeEnabled: false })[1].decision).toBe(
      "off",
    );
  });

  it("the panel's lines (contract P08.checks)", () => {
    const [identity, youtube, crawlers] = planEnhancedChecks(
      beyond({
        identity: daysAgo(3),
        youtube: null,
        crawlers: daysAgo(12),
        technical: null,
        youtubeState: "not_linked",
      }),
      NOW,
      { youtubeEnabled: true },
    );
    expect(checkStatusLine(identity, NOW)).toBe("Checked 3 days ago · will reuse");
    expect(checkStatusLine(youtube, NOW)).toBe("No channel linked · shown as not linked");
    expect(checkStatusLine(crawlers, NOW)).toBe(
      "Checked 12 days ago · will run again (about 1 minute)",
    );
  });
});

describe("the refresh step (fixed clock, recorded runners)", () => {
  it("only the stale checks run: the site checks once for all three, YouTube alone", async () => {
    let now = beyond({
      identity: daysAgo(40),
      youtube: daysAgo(2),
      crawlers: daysAgo(8),
      technical: daysAgo(40),
    });
    const site = vi.fn(async () => {
      now = beyond({
        identity: NOW.toISOString(),
        youtube: daysAgo(2),
        crawlers: NOW.toISOString(),
        technical: NOW.toISOString(),
      });
    });
    const youtube = vi.fn(async () => undefined);
    const outcomes = await refreshEnhancedChecks({
      brand: BRAND,
      read: async () => now,
      runners: { site, youtube },
      youtubeEnabled: true,
      now: () => NOW,
    });
    expect(site).toHaveBeenCalledTimes(1);
    expect(youtube).not.toHaveBeenCalled();
    expect(outcomes.map((o) => [o.check, o.result])).toEqual([
      ["identity", "measured"],
      ["crawlers", "measured"],
      ["technical", "measured"],
    ]);
  });

  it("nothing runs when every check is fresh (a second Enhanced report right after the first)", async () => {
    const site = vi.fn(async () => undefined);
    const youtube = vi.fn(async () => undefined);
    const fresh = beyond({
      identity: daysAgo(1),
      youtube: daysAgo(1),
      crawlers: daysAgo(1),
      technical: daysAgo(1),
    });
    expect(
      await refreshEnhancedChecks({
        brand: BRAND,
        read: async () => fresh,
        runners: { site, youtube },
        youtubeEnabled: true,
        now: () => NOW,
      }),
    ).toEqual([]);
    expect(site).not.toHaveBeenCalled();
    expect(youtube).not.toHaveBeenCalled();
  });

  it("a check that runs out of time, or leaves no newer result, is reported and the tiles still print", async () => {
    const old = beyond({
      identity: daysAgo(1),
      youtube: daysAgo(9),
      crawlers: daysAgo(9),
      technical: daysAgo(1),
    });
    const outcomes = await refreshEnhancedChecks({
      brand: BRAND,
      read: async () => old,
      runners: { site: () => new Promise<void>(() => undefined), youtube: async () => undefined },
      youtubeEnabled: true,
      now: () => NOW,
      timeoutMs: 20,
    });
    expect(outcomes).toEqual([
      {
        check: "crawlers",
        previousCheckedAt: daysAgo(9),
        result: "failed",
        reason: REFRESH_TIMED_OUT,
      },
      {
        check: "youtube",
        previousCheckedAt: daysAgo(9),
        result: "failed",
        reason: REFRESH_DIDNT_COMPLETE,
      },
    ]);
    const printed = applyRefreshOutcomes(old, outcomes, NOW);
    expect(printed.crawlers).toMatchObject({
      status: "failed",
      checkedAt: NOW.toISOString(),
      failure: "the check took too long",
    });
    expect(printed.youtube.status).toBe("failed");
    // The others keep their own results.
    expect(printed.identity).toEqual(old.identity);
    expect(printed.technical).toEqual(old.technical);
    expect(printed.refreshed).toEqual(outcomes);
  });

  it("a runner that throws is a failed check, never a failed report", async () => {
    const old = beyond({
      identity: daysAgo(40),
      youtube: daysAgo(1),
      crawlers: daysAgo(1),
      technical: daysAgo(1),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const outcomes = await refreshEnhancedChecks({
      brand: BRAND,
      read: async () => old,
      runners: {
        site: async () => {
          throw new Error("fetch failed");
        },
        youtube: async () => undefined,
      },
      youtubeEnabled: true,
      now: () => NOW,
    });
    warn.mockRestore();
    expect(outcomes).toEqual([
      {
        check: "identity",
        previousCheckedAt: daysAgo(40),
        result: "failed",
        reason: REFRESH_DIDNT_COMPLETE,
      },
    ]);
  });
});
