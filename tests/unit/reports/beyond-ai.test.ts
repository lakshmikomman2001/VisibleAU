/**
 * S01 part 6 (LLD 8.1.4, contract P07.beyond / P09.beyond): each "Beyond AI answers" tile in its measured, not checked,
 * stale and failed states, and the date rule relative to the report's own time (asOf).
 */
import { describe, expect, it } from "vitest";
import {
  BEYOND_FOOTER,
  type BeyondAiRaw,
  beyondTileViews,
  buildBeyondAiAnswers,
  crawlersView,
  directoriesLines,
  identityView,
  technicalView,
  youtubeView,
} from "@/lib/reports/beyond-ai";

const AS_OF = new Date("2026-11-24T00:00:00Z");
const RECENT = new Date("2026-11-22T01:00:00Z"); // 22 Nov in Sydney
const OLD = new Date("2026-10-14T01:00:00Z"); // 41 days before AS_OF
const BRAND = "b-1";

const ROBOTS_OK = {
  robots: {
    present: true,
    aiBotsAllowed: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"],
    aiBotsBlocked: [],
    fetchStatus: "found",
    botVerdicts: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"].map((ua) => ({
      userAgent: ua,
      verdict: "allowed",
    })),
  },
  scoringVersion: 4,
  crawl: { pagesCrawled: 12, homepageReached: true },
};

function raw(overrides: Partial<BeyondAiRaw> = {}): BeyondAiRaw {
  return {
    brand: { abn: "17701710947", youtubeChannelUrl: null, domain: "techcoreit.com.au" },
    entity: {
      abnVerified: true,
      abnNumber: "17701710947",
      abnEntityName: "ASTORIO GROUP PTY LTD",
      abnStatus: "Active",
      wikipediaAuPresent: false,
      auTldDomains: ["techcoreit.com.au"],
      checkedAt: RECENT,
    },
    youtube: null,
    youtubeGateOn: true,
    technical: {
      scoreComposite: "38.00",
      findings: ROBOTS_OK,
      createdAt: RECENT,
      dims: {
        scoreRobots: "18.00",
        scoreSchema: "2.00",
        scoreMeta: "6.00",
        scoreContent: "8.00",
        scoreBrandEntity: "2.00",
        scoreSignals: "2.00",
        scoreLlmsTxt: "0.00",
        scoreAiDiscovery: "0.00",
      },
    },
    visits: [],
    directories: null,
    ...overrides,
  };
}

const answers = (r: BeyondAiRaw) => buildBeyondAiAnswers(r, AS_OF);

describe("business identity", () => {
  it("measured: ABN verified with the register's status, entity and date; .au and Wikipedia", () => {
    const v = identityView(answers(raw()).identity, BRAND);
    expect(v.pill).toEqual({ text: "ABN verified", tone: "good" });
    expect(v.lines.map((l) => l.text)).toEqual([
      "Active · ASTORIO GROUP PTY LTD · checked 22 Nov 2026",
      ".au domain ✓ · Wikipedia: no article",
    ]);
    expect(v.action).toBeNull();
  });

  it("no ABN on file: a neutral pill and a link to add it, never 'not verified'", () => {
    const v = identityView(
      answers(raw({ brand: { abn: null, youtubeChannelUrl: null, domain: "x.com" }, entity: null }))
        .identity,
      BRAND,
    );
    expect(v.pill).toEqual({ text: "No ABN on file", tone: "neutral" });
    expect(v.action).toEqual({ text: "Add your ABN", href: "/brands/b-1" });
  });

  it("not checked: an ABN on file but no result yet, or the lookup skipped (no GUID)", () => {
    expect(identityView(answers(raw({ entity: null })).identity, BRAND).pill?.text).toBe(
      "Not checked yet",
    );
    const skipped = answers(
      raw({ entity: { ...raw().entity!, abnVerified: false, abnStatus: "check_skipped" } }),
    );
    expect(skipped.identity.status).toBe("not_checked");
    expect(identityView(skipped.identity, BRAND).pill?.text).toBe("Not checked yet");
  });

  it("failed: the register didn't answer, with the date", () => {
    const t = answers(
      raw({ entity: { ...raw().entity!, abnVerified: false, abnStatus: "check_failed" } }),
    ).identity;
    expect(t.status).toBe("failed");
    expect(identityView(t, BRAND).lines.map((l) => l.text)).toContain(
      "Couldn't check on 22 Nov 2026: the Australian Business Register didn't answer",
    );
  });

  it("stale: older than 30 days before the report's time says it may be out of date", () => {
    const t = answers(raw({ entity: { ...raw().entity!, checkedAt: OLD } })).identity;
    expect(t.stale).toBe(true);
    expect(identityView(t, BRAND).lines.at(-1)).toEqual({
      text: "Last checked 14 Oct 2026, may be out of date",
      tone: "warn",
    });
  });

  it("an ABN that isn't active is measured, shown as not verified", () => {
    const t = answers(
      raw({ entity: { ...raw().entity!, abnVerified: false, abnStatus: "Cancelled" } }),
    ).identity;
    expect(identityView(t, BRAND).pill).toEqual({ text: "ABN not verified", tone: "warn" });
  });
});

describe("YouTube", () => {
  const row = {
    checkStatus: "confirmed",
    unavailableReason: null,
    channelTitle: "TechCore IT",
    channelTotalVideos: 14,
    lastUploadAt: new Date("2026-11-02T00:00:00Z"),
    gaps: [],
    auditedAt: RECENT,
  };

  it("measured: channel found with its videos and last upload, no 'videos cited by AI' line", () => {
    const v = youtubeView(answers(raw({ youtube: row })).youtube, BRAND);
    expect(v.pill).toEqual({ text: "Channel found", tone: "good" });
    expect(v.lines.map((l) => l.text)).toEqual([
      "14 videos · last upload 2 Nov 2026",
      "checked 22 Nov 2026",
    ]);
    expect(JSON.stringify(v)).not.toMatch(/cited/i);
  });

  it("no channel linked (no row, or the check found none)", () => {
    expect(youtubeView(answers(raw()).youtube, BRAND)).toMatchObject({
      pill: { text: "No channel linked" },
      action: { text: "Add your channel", href: "/brands/b-1/trust/youtube-presence" },
    });
    const notFound = youtubeView(
      answers(raw({ youtube: { ...row, checkStatus: "not_found" } })).youtube,
      BRAND,
    );
    expect(notFound.pill?.text).toBe("No channel linked");
  });

  it("not checked: the code gate off, or the API key missing (no customer reason)", () => {
    const gateOff = answers(raw({ youtube: row, youtubeGateOn: false })).youtube;
    expect(gateOff.status).toBe("not_checked");
    expect(youtubeView(gateOff, BRAND)).toMatchObject({
      pill: { text: "Not checked" },
      lines: [],
      action: null,
    });
    const noKey = answers(
      raw({
        youtube: { ...row, checkStatus: "unavailable", unavailableReason: "missing_api_key" },
      }),
    ).youtube;
    expect(noKey.status).toBe("not_checked");
    expect(youtubeView(noKey, BRAND).lines).toEqual([]);
  });

  it("failed: quota or network, with the date", () => {
    const t = answers(
      raw({ youtube: { ...row, checkStatus: "unavailable", unavailableReason: "quota_exceeded" } }),
    ).youtube;
    expect(youtubeView(t, BRAND).lines[0].text).toBe(
      "Couldn't check on 22 Nov 2026: YouTube's daily lookup limit was reached",
    );
  });

  it("a channel whose website doesn't match is shown as such", () => {
    const t = answers(
      raw({ youtube: { ...row, checkStatus: "unconfirmed", gaps: ["domain_mismatch", "x.com"] } }),
    ).youtube;
    expect(youtubeView(t, BRAND).lines[0].text).toBe(
      "Channel found but its website doesn't match yours",
    );
  });

  it("stale", () => {
    const t = answers(raw({ youtube: { ...row, auditedAt: OLD } })).youtube;
    expect(youtubeView(t, BRAND).lines.at(-1)?.text).toBe(
      "Last checked 14 Oct 2026, may be out of date",
    );
  });
});

describe("AI crawlers", () => {
  it("measured: search crawlers allowed, of the four, with the date; visits not measured says upload server logs", () => {
    const v = crawlersView(answers(raw()).crawlers, BRAND);
    expect(v.pill).toEqual({ text: "Search crawlers allowed", tone: "good" });
    expect(v.lines.map((l) => l.text)).toEqual([
      "4 of 4 · checked 22 Nov 2026",
      "Visits: not measured · upload server logs",
    ]);
    expect(v.action).toEqual({
      text: "Upload server logs",
      href: "/brands/b-1/retrieval/crawler-logs",
    });
  });

  it("blocked crawlers are a warning with their names", () => {
    const findings = {
      ...ROBOTS_OK,
      robots: {
        ...ROBOTS_OK.robots,
        aiBotsBlocked: ["OAI-SearchBot"],
        botVerdicts: ROBOTS_OK.robots.botVerdicts.map((v) =>
          v.userAgent === "OAI-SearchBot" ? { ...v, verdict: "blocked" } : v,
        ),
      },
    };
    const v = crawlersView(
      answers(raw({ technical: { ...raw().technical!, findings } })).crawlers,
      BRAND,
    );
    expect(v.pill).toEqual({ text: "1 search crawler blocked", tone: "warn" });
    expect(v.lines.map((l) => l.text)).toContain("3 of 4 · checked 22 Nov 2026");
    expect(v.lines.map((l) => l.text)).toContain("Blocked: OAI-SearchBot");
  });

  it("visits from uploaded logs: the 30-day count by crawler", () => {
    const v = crawlersView(
      answers(
        raw({
          visits: [
            { name: "OAI-SearchBot", visits: 9 },
            { name: "Googlebot", visits: 3 },
          ],
        }),
      ).crawlers,
      BRAND,
    );
    expect(v.lines.at(-1)?.text).toBe("Visits in 30 days: 12 (OAI-SearchBot, Googlebot)");
    expect(v.action).toBeNull();
  });

  it("not checked: no technical audit yet, with Run check", () => {
    const v = crawlersView(answers(raw({ technical: null })).crawlers, BRAND);
    expect(v.pill?.text).toBe("Not checked yet");
    expect(v.action).toEqual({ text: "Run check", href: "/brands/b-1/technical-audit" });
  });

  it("failed: robots.txt didn't answer", () => {
    const findings = { ...ROBOTS_OK, robots: { present: false, fetchStatus: "unreachable" } };
    const t = answers(raw({ technical: { ...raw().technical!, findings } })).crawlers;
    expect(t.status).toBe("failed");
    expect(crawlersView(t, BRAND).lines[0].text).toBe(
      "Couldn't check on 22 Nov 2026: your robots.txt didn't answer",
    );
  });

  it("no robots.txt: every search crawler is allowed by the evaluator's verdicts", () => {
    const findings = {
      ...ROBOTS_OK,
      robots: { ...ROBOTS_OK.robots, present: false, aiBotsAllowed: [], fetchStatus: "absent" },
    };
    const t = answers(raw({ technical: { ...raw().technical!, findings } })).crawlers;
    expect(t.searchAllowed).toHaveLength(4);
  });
});

describe("website technical", () => {
  it("measured: score of its own maximum, date and scoring version; the two weakest scored checks", () => {
    const t = answers(raw()).technical;
    expect(technicalView(t, BRAND)).toMatchObject({
      value: { main: "38", of: "of 74" },
      lines: [{ text: "checked 22 Nov 2026 · v4 scoring" }],
    });
    expect(t.weakest.map((w) => w.label)).toEqual(["Schema markup", "Brand & Entity"]);
  });

  it("not checked: no technical audit yet", () => {
    expect(technicalView(answers(raw({ technical: null })).technical, BRAND)).toMatchObject({
      pill: { text: "Not checked yet" },
      value: null,
      action: { text: "Run check" },
    });
  });

  it("failed: no composite stored because the site couldn't be reached -- never a 0", () => {
    const technical = {
      ...raw().technical!,
      scoreComposite: null,
      findings: { ...ROBOTS_OK, crawl: { pagesCrawled: 0, homepageReached: false } },
    };
    const v = technicalView(answers(raw({ technical })).technical, BRAND);
    expect(v.value).toBeNull();
    expect(v.lines[0].text).toBe("Couldn't check on 22 Nov 2026: we couldn't reach your website");
  });

  it("stale", () => {
    const v = technicalView(
      answers(raw({ technical: { ...raw().technical!, createdAt: OLD } })).technical,
      BRAND,
    );
    expect(v.lines.at(-1)).toEqual({
      text: "Last checked 14 Oct 2026, may be out of date",
      tone: "warn",
    });
  });
});

describe("the report's own time", () => {
  it("a result is stale only relative to asOf: the same row is current for an older report", () => {
    const r = raw({ entity: { ...raw().entity!, checkedAt: OLD } });
    expect(buildBeyondAiAnswers(r, AS_OF).identity.stale).toBe(true);
    expect(buildBeyondAiAnswers(r, new Date("2026-10-20T00:00:00Z")).identity.stale).toBe(false);
  });

  it("the four tiles in contract order; none shows a 0 for 'not measured'", () => {
    const views = beyondTileViews(
      answers(
        raw({
          entity: null,
          technical: null,
          brand: { abn: null, youtubeChannelUrl: null, domain: "x.com" },
        }),
      ),
      BRAND,
    );
    expect(views.map((v) => v.label)).toEqual([
      "Business identity",
      "YouTube",
      "AI crawlers",
      "Website technical",
    ]);
    expect(JSON.stringify(views)).not.toMatch(/"0"|\b0 of\b/);
  });

  it("the footer sentence", () => {
    expect(BEYOND_FOOTER).toBe(
      "These checks are separate from the Visibility score and don't change it.",
    );
  });
});

describe("directory profiles (PDF tile)", () => {
  it("linked of cited, then each directory", () => {
    expect(
      directoriesLines({
        basisAuditId: "a",
        linked: 1,
        cited: 2,
        items: [
          { name: "Local Business Guide", linked: false, citedIn: 14 },
          { name: "LinkedIn", linked: true, citedIn: 1 },
        ],
      }),
    ).toEqual([
      "Linked 1 of 2 directories AI cites for your questions.",
      "Local Business Guide: not linked (cited in 14 answers)",
      "LinkedIn: linked · cited in 1 answer",
    ]);
  });

  it("none linked", () => {
    expect(
      directoriesLines({
        basisAuditId: "a",
        linked: 0,
        cited: 1,
        items: [{ name: "Yelp", linked: false, citedIn: 3 }],
      })[0],
    ).toBe("No profiles linked yet.");
  });
});
