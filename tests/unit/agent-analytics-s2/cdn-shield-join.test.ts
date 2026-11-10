import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CDN Shield × crawler activity (lib/agent-analytics/cdn-shield-join.ts).
 *
 * Stale since the af8de42..d1eb5a1 follow-ups (10 Nov), part 2: this was "§5.3, exactly 4 verdicts" from a
 * shield probe sent as GPTBot, ClaudeBot, Googlebot and PerplexityBot (deriveVerdict(blocked, crawling)), and a
 * crawling vendor with no probe was "assumed allowed". Nothing is sent as another company's crawler now. A
 * verdict comes from robots.txt's own rules for the crawler and its verified visits in the logs; where those
 * can't tell, the fifth verdict says it can't be tested from outside, with where to upload logs.
 */

// With the postgres-js driver, drizzle's execute() resolves to the rows array itself, which is how
// lib/agent-analytics reads it.
vi.mock("@/db/client", () => ({
  serviceDb: { execute: vi.fn() },
}));

import { serviceDb } from "@/db/client";
import {
  CANT_TEST_FROM_OUTSIDE,
  computeCdnShieldJoin,
  deriveVerdict,
  joinCrawlerAccess,
  LOG_UPLOAD_POINTER,
} from "@/lib/agent-analytics/cdn-shield-join";
import { evaluateRobotsForAgent } from "@/lib/robots-txt/evaluate";

const mockExecute = serviceDb.execute as ReturnType<typeof vi.fn>;

const ALLOW_ALL = "User-agent: *\nAllow: /\n";
const BLOCK_CLAUDE = "User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n";

describe("deriveVerdict: robots.txt and verified visits, nothing else", () => {
  const allowed = evaluateRobotsForAgent(ALLOW_ALL, "GPTBot");
  const blocked = evaluateRobotsForAgent("User-agent: GPTBot\nDisallow: /", "GPTBot");

  it("allowed + verified visits → healthy", () => {
    const v = deriveVerdict({
      crawler: "GPTBot",
      robots: allowed,
      verifiedVisits: 12,
      hasLogData: true,
    });
    expect(v.verdict).toBe("healthy");
    expect(v.sentence).toContain("12 verified visits from GPTBot");
  });

  it("allowed + logs without it → allowed, not in your logs (and why a CDN would hide it)", () => {
    const v = deriveVerdict({
      crawler: "GPTBot",
      robots: allowed,
      verifiedVisits: 0,
      hasLogData: true,
    });
    expect(v.verdict).toBe("not_blocked_never_visited");
    expect(v.sentence).toContain("no verified GPTBot visits");
    expect(v.sentence).toContain("never reach your logs");
  });

  it("allowed + no logs at all → can't be tested from outside, with the log upload", () => {
    const v = deriveVerdict({
      crawler: "GPTBot",
      robots: allowed,
      verifiedVisits: 0,
      hasLogData: false,
    });
    expect(v.verdict).toBe("not_testable");
    expect(v.sentence).toContain(CANT_TEST_FROM_OUTSIDE);
    expect(v.sentence).toContain(LOG_UPLOAD_POINTER);
  });

  it("blocked + no visits → blocked by robots.txt", () => {
    const v = deriveVerdict({
      crawler: "GPTBot",
      robots: blocked,
      verifiedVisits: 0,
      hasLogData: false,
    });
    expect(v.verdict).toBe("self_blocked");
    expect(v.sentence).toBe("robots.txt blocks GPTBot, so GPTBot won't read your site.");
  });

  it("blocked + verified visits → visits despite robots.txt (NOT healthy)", () => {
    const v = deriveVerdict({
      crawler: "GPTBot",
      robots: blocked,
      verifiedVisits: 3,
      hasLogData: true,
    });
    expect(v.verdict).toBe("robots_violation");
    expect(v.sentence).toContain("but your logs show 3 verified visits");
  });

  it("robots.txt unreadable → never a robots verdict; the visits still count", () => {
    expect(
      deriveVerdict({ crawler: "GPTBot", robots: null, verifiedVisits: 0, hasLogData: false })
        .verdict,
    ).toBe("not_testable");
    const seen = deriveVerdict({
      crawler: "GPTBot",
      robots: null,
      verifiedVisits: 2,
      hasLogData: true,
    });
    expect(seen.verdict).toBe("healthy");
    expect(seen.sentence).toContain("robots.txt couldn't be read");
  });

  it("every input maps to one of the five verdicts", () => {
    const valid = new Set([
      "healthy",
      "not_blocked_never_visited",
      "self_blocked",
      "robots_violation",
      "not_testable",
    ]);
    for (const robots of [allowed, blocked, null])
      for (const verifiedVisits of [0, 1])
        for (const hasLogData of [false, true])
          expect(
            valid.has(
              deriveVerdict({ crawler: "GPTBot", robots, verifiedVisits, hasLogData }).verdict,
            ),
          ).toBe(true);
  });
});

describe("what CDN Shield shows (the before/after report's two brands)", () => {
  it("a brand with no logs: every crawler 'can't be tested from outside', never 'Not Blocked'", () => {
    const rows = joinCrawlerAccess({ status: "found", text: ALLOW_ALL }, [], false);
    expect(rows.map((r) => [r.crawlerName, r.verdict])).toEqual([
      ["GPTBot", "not_testable"],
      ["ClaudeBot", "not_testable"],
      ["Google-Extended", "not_testable"],
      ["PerplexityBot", "not_testable"],
    ]);
    for (const row of rows) {
      expect(row.sentence).toContain(`robots.txt allows ${row.crawlerName}`);
      expect(row.sentence).toContain(LOG_UPLOAD_POINTER);
      expect(row.sentence).not.toMatch(/not blocked/i);
    }
  });

  it("a brand with logs: verified visits and robots.txt decide each row", () => {
    const rows = joinCrawlerAccess(
      { status: "found", text: BLOCK_CLAUDE },
      [
        { vendor: "openai", crawlerName: "GPTBot", visits: 12 },
        { vendor: "google", crawlerName: "GeminiBot", visits: 3 },
      ],
      true,
    );
    const by = Object.fromEntries(rows.map((r) => [r.vendor, r]));
    expect(by.openai.verdict).toBe("healthy");
    expect(by.anthropic.verdict).toBe("self_blocked");
    expect(by.anthropic.sentence).toBe(
      "robots.txt blocks ClaudeBot, so ClaudeBot won't read your site.",
    );
    expect(by.google.verdict).toBe("healthy");
    expect(by.google.sentence).toContain("3 verified visits from GeminiBot");
    expect(by.perplexity.verdict).toBe("not_blocked_never_visited");
  });

  it("no robots.txt: says so, and nothing in it blocks anyone", () => {
    const rows = joinCrawlerAccess({ status: "absent", httpStatus: 404 }, [], false);
    expect(rows[0].sentence).toContain("No robots.txt was found, so nothing in it blocks GPTBot");
  });

  it("a crawling company that isn't one of the four is evaluated under its own crawler's name", () => {
    const rows = joinCrawlerAccess(
      { status: "found", text: "User-agent: Bytespider\nDisallow: /" },
      [{ vendor: "bytedance", crawlerName: "Bytespider", visits: 5 }],
      true,
    );
    const bytedance = rows.find((r) => r.vendor === "bytedance");
    expect(bytedance?.verdict).toBe("robots_violation");
  });
});

describe("computeCdnShieldJoin reads the logs, never the site", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts verified visits only, and sends no request anywhere", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mockExecute
      .mockResolvedValueOnce([{ vendor: "openai", crawler_name: "GPTBot", visits: 7 }])
      .mockResolvedValueOnce([{ has_log_data: true }]);

    const rows = await computeCdnShieldJoin(
      "brand-1",
      { status: "found", text: ALLOW_ALL },
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    const firstQuery = JSON.stringify(mockExecute.mock.calls[0][0]);
    expect(firstQuery).toContain("verification_status = 'verified'");
    expect(rows.find((r) => r.vendor === "openai")?.verifiedVisits).toBe(7);
    expect(rows.find((r) => r.vendor === "anthropic")?.verdict).toBe("not_blocked_never_visited");
    vi.unstubAllGlobals();
  });
});
