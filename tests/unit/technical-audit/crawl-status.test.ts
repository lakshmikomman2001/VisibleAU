/**
 * 17 Nov, part 3 ("every brand page must agree with the audit") -- a technical audit whose crawl never reached
 * the site. lib/crawler fetchPage gave up on any non-2xx answer, the crawl went on with no pages, and the row
 * stored meta 0, schema 0, content 0, signals a clean 6 of 6 and robots.txt +3 for "CDN not blocking": a site
 * that was down read as a measured, badly built one. The pages now detect it from what's stored (old rows
 * included) and the writer stores no score for the checks that needed the site.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrawlResult } from "@/lib/crawler/types";
import {
  crawlFindings,
  crawlReach,
  isSiteDependentDimension,
  SITE_DEPENDENT_DIMENSIONS,
  siteUnreachableSentence,
} from "@/lib/technical-audit/crawl-status";
import { orchestrateTechnicalAudit } from "@/lib/technical-audit/orchestrate";
import { comparableCompositeDelta, compositeMaxAt } from "@/lib/technical-audit/score-aggregator";

/** A crawl whose home page answered 503: no pages, nothing else found (lib/crawler/index.ts). */
const DOWN: CrawlResult = {
  domain: "down.example.com.au",
  pages: [],
  robotsTxt: null,
  sitemapXml: null,
  crawledAt: new Date("2026-11-14T00:00:00Z"),
  errors: ["Failed to fetch https://down.example.com.au (HTTP 503)"],
  homepage: { url: "https://down.example.com.au", reached: false, httpStatus: 503 },
  sitemap: {
    url: "https://down.example.com.au/sitemap.xml",
    status: "unreachable",
    httpStatus: 503,
  },
  robotsTxtFetch: { status: "unreachable", httpStatus: 503 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("crawlReach -- from what a technical audit stored", () => {
  it("a row from 17 Nov says so in findings.crawl", () => {
    expect(crawlReach({ crawl: crawlFindings(DOWN) })).toEqual({
      kind: "unreached",
      httpStatus: 503,
    });
    expect(crawlReach({ crawl: { pagesCrawled: 9, homepageReached: true } })).toEqual({
      kind: "reached",
      pagesCrawled: 9,
    });
  });

  it("an older row: its SSR check ran over every page fetched, so pagesChecked 0 is a crawl that reached nothing", () => {
    // The real shape a failed crawl stored before 17 Nov (lib/ssr-check/per-page.ts with no homepage).
    const legacyDown = {
      meta: { score: 0, titlePresent: false, descriptionPresent: false },
      content: {
        score: 0,
        wordCount: 0,
        ssr: { healthy: true, pagesChecked: 0, pages: [] },
        negativeSignals: [],
        promptInjections: [],
      },
      signals: { score: 6 },
    };
    expect(crawlReach(legacyDown)).toEqual({ kind: "unreached", httpStatus: null });
    expect(
      crawlReach({ content: { ssr: { healthy: false, pagesChecked: 12, pages: [] } } }),
    ).toEqual({ kind: "reached", pagesCrawled: 12 });
  });

  it("a row that recorded neither can't tell -- 'unknown', never 'unreached'", () => {
    expect(crawlReach({})).toEqual({ kind: "unknown" });
    expect(crawlReach(null)).toEqual({ kind: "unknown" });
    expect(crawlReach({ content: {} })).toEqual({ kind: "unknown" });
  });
});

describe("what the pages say", () => {
  it("names the domain, the day and the answer, and says the checks weren't run", () => {
    const s = siteUnreachableSentence("down.example.com.au", "14/11/2026", 503);
    expect(s).toContain("We couldn't reach down.example.com.au when we crawled it on 14/11/2026.");
    expect(s).toContain("Its home page answered HTTP 503.");
    expect(s).toContain("A firewall or bot protection can answer crawlers this way.");
    expect(s).toContain("weren't run, so they have no score");
    expect(s).not.toMatch(/ -- /);
  });

  it("no answer at all is a timeout or a connection error, not an HTTP status", () => {
    expect(siteUnreachableSentence("x.com.au", null, null)).toContain(
      "It didn't answer at all (a timeout or a connection error).",
    );
  });

  it("Brand & Entity is the one check that doesn't need the site", () => {
    expect(isSiteDependentDimension("scoreBrandEntity")).toBe(false);
    for (const key of ["scoreRobots", "scoreMeta", "scoreSchema", "scoreContent", "scoreSignals"]) {
      expect(isSiteDependentDimension(key)).toBe(true);
    }
    expect(SITE_DEPENDENT_DIMENSIONS).toHaveLength(7);
  });
});

describe("the writer: a crawl that reached nothing stores no site score", () => {
  it("orchestrateTechnicalAudit on a down site: siteReached false, every site check unmeasured, findings.crawl recorded", async () => {
    // Every request the audit makes (llms.txt, the AI discovery files) gets a 503 too.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Service Unavailable", { status: 503 })),
    );
    const result = await orchestrateTechnicalAudit("down.example.com.au", DOWN, 2);
    expect(result.siteReached).toBe(false);
    expect([...result.unmeasured].sort()).toEqual([...SITE_DEPENDENT_DIMENSIONS].sort());
    expect(result.findings.crawl).toEqual({
      pagesCrawled: 0,
      homepageReached: false,
      homepageHttpStatus: 503,
      sitemap: DOWN.sitemap,
    });
    // The scorers still return their numbers for nothing (signals 6 of 6) -- which is why none is stored.
    expect(result.dimensions.scoreSignals).toBe(6);
    // The llms.txt request that got a 503 is "couldn't check", not a missing file.
    expect((result.findings.llmsTxt as { fetchStatus: string }).fetchStatus).toBe("unreachable");
  });

  it("run-technical-audit-inline stores null for an unmeasured check and no composite then", () => {
    const src = readFileSync("lib/audit/run-technical-audit-inline.ts", "utf8");
    expect(src).toMatch(
      /result\.unmeasured\.includes\(key\) \? null : result\.dimensions\[key\]\.toFixed\(2\)/,
    );
    // Leftovers task, part 3: and none when the ABN or Wikipedia lookup didn't complete.
    // 19 Nov: the ternary is written across lines (biome), so any whitespace between its parts. 20 Nov: only a scored
    // check that couldn't be measured holds the composite back (unmeasuredScored: llms.txt and ai.txt aren't scored).
    expect(src).toMatch(
      /result\.unmeasuredScored\.length === 0 && !entityLookupFailed\s+\?\s+result\.scoreComposite\.toFixed\(2\)\s+:\s+null/,
    );
    // Brand & Entity doesn't read the site: it keeps its score -- unless one of its lookups didn't complete.
    expect(src).toMatch(
      /scoreBrandEntity: entityLookupFailed \? null : result\.dimensions\.scoreBrandEntity\.toFixed\(2\)/,
    );
    // The Wikipedia lookup's own state is kept (Couldn't check vs not found).
    expect(src).toMatch(/wikipediaAuStatus: wikiStatus\.status/);
  });
});

describe("the composite's change from the previous audit compares like with like", () => {
  const audit = (composite: number | null, siteReached = true) => ({
    composite,
    createdAt: "2026-11-10T00:00:00Z",
    siteReached,
  });

  it("two audits on the /98 scale that both reached the site: the change", () => {
    expect(comparableCompositeDelta(audit(50), audit(41))).toBe(9);
  });

  it("an audit from before 21 Oct could score up to 100: no comparison across the change", () => {
    expect(compositeMaxAt("2026-10-20T00:00:00Z")).toBe(100);
    expect(compositeMaxAt("2026-10-22T00:00:00Z")).toBe(98);
    expect(
      comparableCompositeDelta(audit(50), {
        composite: 60,
        createdAt: "2026-10-01T00:00:00Z",
        siteReached: true,
      }),
    ).toBeNull();
  });

  it("no comparison with (or from) a crawl that never reached the site, or a missing composite", () => {
    expect(comparableCompositeDelta(audit(50), audit(12, false))).toBeNull();
    expect(comparableCompositeDelta(audit(50, false), audit(41))).toBeNull();
    expect(comparableCompositeDelta(audit(null), audit(41))).toBeNull();
    expect(comparableCompositeDelta(audit(50), null)).toBeNull();
  });
});

describe("every technical page detects a crawl that never reached the site", () => {
  const PAGES = [
    "technical-audit",
    "robots-txt-config",
    "llms-txt-generator",
    "schema-audit",
    "meta-tags",
    "ssr-check",
    "answer-capsules",
    "signals",
    "ai-discovery",
  ];

  for (const page of PAGES) {
    it(`${page}: reads crawlReach and shows the notice`, () => {
      const src = readFileSync(`app/(auth)/brands/[brandId]/${page}/page.tsx`, "utf8");
      expect(src).toMatch(/crawlReach\(techAudit\.findings\)/);
      expect(src).toMatch(/<SiteUnreachableNotice/);
    });
  }

  it("the Health Check's site readiness has no score for it either", () => {
    const src = readFileSync("app/api/brands/[brandId]/site-readiness/route.ts", "utf8");
    expect(src).toMatch(/crawlReach\(latest\.findings\)\.kind === "unreached"/);
    expect(src).toMatch(/scoreComposite: siteUnreachable \? null/);
  });
});
