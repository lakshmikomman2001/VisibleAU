/**
 * ⚠️ KK — robots.txt: two of the six 3-point sub-checks ("no blanket AI
 * block", "AI bots not explicitly blocked") used to pass trivially on a
 * MISSING robots.txt -- an empty string has no blanket-block pattern and
 * no bot-specific Disallow either, so absence looked identical to a
 * genuinely permissive, real file. This is a configuration audit: no file
 * means no configuration to credit.
 */
import { describe, expect, it } from "vitest";
import { analyzeRobots } from "@/lib/robots-txt/analyze";
import type { CrawlResult } from "@/lib/crawler/types";

function crawl(robotsTxt: string | null, statusCode = 200): CrawlResult {
  return {
    domain: "example.com.au",
    pages: [
      {
        url: "https://example.com.au/",
        statusCode,
        title: "Example",
        textContent: "",
        wordCount: 10,
        excerpt: "",
        byline: null,
        html: "<html></html>",
        headers: {},
      },
    ],
    robotsTxt,
    sitemapXml: null,
    crawledAt: new Date(),
    errors: [],
  };
}

// Bondi's real, permissive robots.txt (task Y/BB/JJ): User-agent: * with
// no Disallow, a Sitemap line, a Content-Signal opt-in line.
const BONDI_REAL_ROBOTS = `Sitemap: https://www.bondiplumbing.com.au/sitemap.xml
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
`;

describe("⚠️ KK — analyzeRobots: missing file scores 0 on the content-gated checks", () => {
  it("missing robots.txt (null) no longer earns the blanket-block / bots-not-blocked points", () => {
    const result = analyzeRobots(crawl(null));
    expect(result.findings.present).toBe(false);
    // present(0) + tier1(0, already gated) + blanket-block(0, NEW gate) +
    // sitemap(0) + bots-not-blocked(0, NEW gate) -- only the independent
    // CDN check (homepage not 403/503) can still contribute.
    expect(result.score).toBeLessThanOrEqual(3);
    expect(result.findings.recommendations.join(" ")).toMatch(
      /AI crawler access is undeclared/i,
    );
  });

  it("an empty-string robots.txt is treated the same as missing", () => {
    const result = analyzeRobots(crawl(""));
    expect(result.findings.present).toBe(false);
    expect(result.score).toBeLessThanOrEqual(3);
  });

  it("REGRESSION — Bondi's real, present, permissive robots.txt still scores 18/18, byte-identical", () => {
    const result = analyzeRobots(crawl(BONDI_REAL_ROBOTS, 200));
    expect(result.score).toBe(18);
    expect(result.findings.present).toBe(true);
  });

  it("a present-but-blocking robots.txt (explicit blanket Disallow) still scores the gated checks as failing", () => {
    const blocking = `User-agent: *
Disallow: /
`;
    const result = analyzeRobots(crawl(blocking));
    expect(result.findings.present).toBe(true);
    // present(3) earned; blanket-block(0, genuinely blocking); sitemap(0).
    // CDN(3, homepage 200). tier1/bots-blocked depend on bot-specific
    // rules, which this file doesn't have, so those still evaluate via
    // the blanket "*" rule's absence of a per-bot match -- score stays
    // well under 18 either way; the key assertion is it's PRESENT and the
    // blanket-block check correctly fails.
    expect(result.score).toBeLessThan(18);
  });
});
