/**
 * 17 Nov, part 3 -- the robots.txt page. Only the 5 tier-1 crawlers were looked at, by a regex that called
 * "Disallow: /admin" a block, and the other 22 always showed a green tick and "Default": a tier read "All
 * allowed 9/9" with nothing checked. Every crawler is evaluated now by lib/robots-txt/evaluate.ts (RFC 9309), the
 * one evaluator; one the audit didn't evaluate reads "Not checked". The "CDN Blocking Detected" alert could never
 * be true (the crawler dropped every 403/503); it reads the home page's real answer now.
 */
import { describe, expect, it } from "vitest";
import type { CrawlResult } from "@/lib/crawler/types";
import { getAllBots } from "@/lib/robots-txt/ai-bots";
import { analyzeRobots } from "@/lib/robots-txt/analyze";
import {
  botRow,
  botStatusLabel,
  matrixNotCheckedSentence,
  robotsMatrixState,
  snippetAgents,
  tierSummary,
} from "@/lib/robots-txt/display";

function crawl(robotsTxt: string | null, extra: Partial<CrawlResult> = {}): CrawlResult {
  return {
    domain: "example.com.au",
    pages: [
      {
        url: "https://example.com.au/",
        statusCode: 200,
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
    ...extra,
  };
}

describe("analyzeRobots -- every crawler, one evaluator", () => {
  // 20 Nov (part 2): 26 -- GeminiBot, Gemini-User and OpenAI-Search are on no page of the company they were credited to;
  // Claude-SearchBot and Googlebot were missing (db/seed/ai-bots/seed.ts).
  it("stores a verdict for every crawler in the list, not just the 5 tier-1 ones", () => {
    const { findings } = analyzeRobots(crawl("User-agent: *\nAllow: /\n"));
    expect(findings.botVerdicts).toHaveLength(getAllBots().length);
    expect(getAllBots().length).toBe(26);
  });

  it("'Disallow: /admin' under GPTBot is not a block of GPTBot (the old regex said it was)", () => {
    const { findings } = analyzeRobots(crawl("User-agent: GPTBot\nDisallow: /admin\n"));
    const gpt = findings.botVerdicts?.find((v) => v.userAgent === "GPTBot");
    expect(gpt?.verdict).toBe("allowed");
    expect(findings.aiBotsBlocked).not.toContain("GPTBot");
  });

  it("a crawler blocked in its own group is blocked, with the rule that did it", () => {
    const { findings } = analyzeRobots(crawl("User-agent: Bytespider\nDisallow: /\n"));
    const v = findings.botVerdicts?.find((b) => b.userAgent === "Bytespider");
    expect(v).toEqual({
      userAgent: "Bytespider",
      verdict: "blocked",
      basis: "agent-group",
      rule: "Disallow: /",
    });
  });

  it("a robots.txt that didn't answer (5xx) has no verdicts and isn't readable -- never 'no robots.txt, nothing blocks'", () => {
    const result = analyzeRobots(
      crawl(null, { robotsTxtFetch: { status: "unreachable", httpStatus: 503 } }),
    );
    expect(result.readable).toBe(false);
    expect(result.findings.botVerdicts).toBeUndefined();
    expect(result.findings.fetchStatus).toBe("unreachable");
    expect(result.findings.recommendations.join(" ")).toContain("We couldn't read your robots.txt");
    expect(result.findings.recommendations.join(" ")).not.toContain("No robots.txt found");
  });

  it("no home page (a crawl that reached nothing) earns no 'not turned away' points", () => {
    const reached = analyzeRobots(crawl("User-agent: *\nAllow: /\nSitemap: https://x/s.xml\n"));
    const unreached = analyzeRobots(
      crawl("User-agent: *\nAllow: /\nSitemap: https://x/s.xml\n", { pages: [] }),
    );
    expect(reached.score - unreached.score).toBe(3);
  });

  it("a home page that answered our crawler 403 is the 'turned away' finding, from a real answer", () => {
    const { findings } = analyzeRobots(
      crawl("User-agent: *\nAllow: /\n", {
        pages: [],
        homepage: { url: "https://example.com.au", reached: false, httpStatus: 403 },
      }),
    );
    expect(findings.cdnBlockingDetected).toBe(true);
    expect(findings.homepageHttpStatus).toBe(403);
    expect(findings.recommendations.join(" ")).toContain(
      "Your site answered our crawler with HTTP 403.",
    );
  });

  it("REGRESSION -- Bondi's real, permissive robots.txt still scores 18 of 18", () => {
    const bondi = `Sitemap: https://www.galahplumbing.com.au/sitemap.xml
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
`;
    expect(analyzeRobots(crawl(bondi)).score).toBe(18);
  });
});

describe("the page's matrix (lib/robots-txt/display.ts)", () => {
  it("an audit from before 17 Nov (no botVerdicts) reads 'Not checked' for every crawler -- no green ticks", () => {
    const legacy = {
      present: true,
      score: 18,
      aiBotsAllowed: ["GPTBot", "ClaudeBot"],
      aiBotsBlocked: [],
      cdnBlockingDetected: false,
      cdnVendor: null,
      recommendations: [],
    };
    expect(robotsMatrixState(legacy)).toEqual({ evaluated: false, reason: "legacy" });
    expect(botStatusLabel(botRow(legacy, "PerplexityBot"))).toBe("Not checked");
    expect(botStatusLabel(botRow(legacy, "GPTBot"))).toBe("Not checked");
    expect(tierSummary(legacy, ["GPTBot", "ClaudeBot"])).toEqual({ checked: false });
    expect(matrixNotCheckedSentence(robotsMatrixState(legacy))).toContain("Run the audit again");
  });

  it("an evaluated audit: each verdict says which rule decided it, and a tier counts real verdicts", () => {
    const { findings } = analyzeRobots(
      crawl("User-agent: *\nAllow: /\n\nUser-agent: CCBot\nDisallow: /\n"),
    );
    expect(botStatusLabel(botRow(findings, "GPTBot"))).toBe("Allowed (rules for every crawler)");
    expect(botStatusLabel(botRow(findings, "CCBot"))).toBe("Blocked");
    // 20 Nov: grouped by role -- CCBot is a training and dataset crawler.
    const training = getAllBots()
      .filter((b) => b.role === "training")
      .map((b) => b.userAgent);
    expect(tierSummary(findings, training)).toEqual({
      checked: true,
      allowed: training.length - 1,
      blocked: 1,
      total: training.length,
    });
  });

  it("no robots.txt at all: allowed because nothing restricts them, and it says so", () => {
    const { findings } = analyzeRobots(
      crawl(null, { robotsTxtFetch: { status: "absent", httpStatus: 404 } }),
    );
    expect(botStatusLabel(botRow(findings, "GPTBot"))).toBe("Allowed (no robots.txt)");
  });

  // 20 Nov (part 2): the search crawlers and user-triggered agents only -- training crawlers are the owner's choice.
  it("the suggested robots.txt allows the search crawlers and assistants, less any the site blocks by name", () => {
    const { findings } = analyzeRobots(crawl("User-agent: PerplexityBot\nDisallow: /\n"));
    const agents = snippetAgents(findings);
    const recommended = getAllBots().filter(
      (b) => (b.role === "search" || b.role === "user") && b.defaultAllow,
    );
    expect(agents).not.toContain("PerplexityBot");
    expect(agents).toHaveLength(recommended.length - 1);
    expect(agents).not.toContain("Bytespider");
    expect(agents).not.toContain("GPTBot");
    expect(snippetAgents(undefined)).toHaveLength(recommended.length);
  });
});
