/**
 * 20 Nov (Sri's decision, part 2): robots.txt is scored on the crawlers that put a site in AI answers -- the search
 * crawlers OAI-SearchBot, Claude-SearchBot, PerplexityBot and Googlebot -- each classified by its company's own page.
 * Blocking a training crawler (GPTBot, ClaudeBot, CCBot) or the Google-Extended control token is the owner's choice:
 * shown, no points lost, no task. User-triggered agents are shown with "robots.txt may not apply" where their company
 * says so. Blocking a search crawler or Googlebot is a real finding, with a task.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tasks = vi.hoisted(() => ({ created: [] as Array<{ title: string }> }));
vi.mock("@/db/client", () => ({ serviceDb: {}, db: {} }));
vi.mock("@/lib/workflow/task-manager", () => ({
  createTask: async (task: { title: string }) => {
    tasks.created.push(task);
    return task;
  },
}));

import { AI_BOTS } from "@/db/seed/ai-bots/seed";
import { joinCrawlerAccess } from "@/lib/agent-analytics/cdn-shield-join";
import { emitCdnJoinTasks } from "@/lib/agent-analytics/task-emitter";
import type { CrawlResult } from "@/lib/crawler/types";
import { isActiveAgentUserAgent } from "@/lib/retrieval/visit-classifier";
import { analyzeRobots } from "@/lib/robots-txt/analyze";
import { snippetAgents } from "@/lib/robots-txt/display";
import {
  AI_CRAWLERS_CHECKED,
  crawlerRoleOf,
  readinessRobots,
  SEARCH_CRAWLERS,
} from "@/lib/robots-txt/evaluate";

const ALLOW_ALL = "User-agent: *\nAllow: /\nSitemap: https://acme.com.au/sitemap.xml\n";

function crawl(robotsTxt: string): CrawlResult {
  return {
    domain: "acme.com.au",
    pages: [
      {
        url: "https://acme.com.au/",
        statusCode: 200,
        title: "Acme Plumbing",
        textContent: "Acme",
        wordCount: 1,
        excerpt: "",
        byline: null,
        html: "<html></html>",
        headers: {},
      },
    ],
    robotsTxt,
    sitemapXml: null,
    crawledAt: new Date("2026-11-20T00:00:00Z"),
    errors: [],
    homepage: { url: "https://acme.com.au/", reached: true, httpStatus: 200 },
    robotsTxtFetch: { status: "found", httpStatus: 200 },
  };
}

const block = (agent: string) => `User-agent: ${agent}\nDisallow: /\n\n${ALLOW_ALL}`;

beforeEach(() => {
  tasks.created = [];
});

describe("each crawler's role is its company's", () => {
  it("search, user-triggered, training and control, as the four companies' pages (and Common Crawl's) say", () => {
    const roles = Object.fromEntries(AI_CRAWLERS_CHECKED.map((c) => [c.crawler, c.role]));
    expect(roles).toEqual({
      "OAI-SearchBot": "search",
      "Claude-SearchBot": "search",
      PerplexityBot: "search",
      Googlebot: "search",
      "ChatGPT-User": "user",
      "Claude-User": "user",
      "Perplexity-User": "user",
      GPTBot: "training",
      ClaudeBot: "training",
      CCBot: "training",
      "Google-Extended": "control",
    });
    expect([...SEARCH_CRAWLERS].sort()).toEqual(
      ["Claude-SearchBot", "Googlebot", "OAI-SearchBot", "PerplexityBot"].sort(),
    );
    // The page's list agrees, and every one of those companies' tokens on it is classified.
    for (const c of AI_CRAWLERS_CHECKED) {
      expect(AI_BOTS.find((b) => b.userAgent === c.crawler)?.role).toBe(c.role);
    }
  });

  it("the doc comment quotes each company's page", () => {
    const src = readFileSync("lib/robots-txt/evaluate.ts", "utf8");
    for (const url of [
      "https://developers.openai.com/api/docs/bots",
      "https://support.claude.com/en/articles/8896518",
      "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
      "https://docs.perplexity.ai/guides/bots",
      "https://commoncrawl.org/ccbot",
    ]) {
      expect(src).toContain(url);
    }
    expect(src).toContain(
      "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search",
    );
    expect(src).toContain("It is not used to crawl content for AI foundation models.");
  });

  it("no name the list credited to a company that the company doesn't list", () => {
    const agents = AI_BOTS.map((b) => b.userAgent);
    for (const gone of ["GeminiBot", "Gemini-User", "OpenAI-Search"]) {
      expect(agents).not.toContain(gone);
    }
  });
});

describe("the robots.txt score counts the search crawlers alone", () => {
  it("a site that allows everything: 18 of 18", () => {
    expect(analyzeRobots(crawl(ALLOW_ALL)).score).toBe(18);
  });

  it("blocked GPTBot, ClaudeBot, CCBot or Google-Extended: no points lost, no recommendation -- the owner's choice", () => {
    for (const agent of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended"]) {
      const r = analyzeRobots(crawl(block(agent)));
      expect(r.score).toBe(18);
      expect(r.findings.recommendations).toEqual([]);
      expect(r.findings.aiBotsBlocked).toEqual([]);
      expect(r.findings.ownersChoiceBlocked).toEqual([agent]);
    }
  });

  it("blocked OAI-SearchBot or Googlebot: points lost, and a recommendation that names it", () => {
    for (const agent of ["OAI-SearchBot", "Googlebot", "PerplexityBot", "Claude-SearchBot"]) {
      const r = analyzeRobots(crawl(block(agent)));
      expect(r.score).toBe(12);
      expect(r.findings.aiBotsBlocked).toEqual([agent]);
      expect(r.findings.recommendations.join(" ")).toContain(
        `Your robots.txt blocks ${agent}, the search crawler behind AI answers`,
      );
    }
  });

  it("a blanket User-agent: * block reaching the search crawlers costs points; one they each override doesn't", () => {
    const blanket = analyzeRobots(crawl("User-agent: *\nDisallow: /\n"));
    expect(blanket.score).toBeLessThan(18);
    expect(blanket.findings.recommendations.join(" ")).toContain("(User-agent: *) block");
    const overridden = analyzeRobots(
      crawl(
        `User-agent: *\nDisallow: /\n\n${SEARCH_CRAWLERS.map((c) => `User-agent: ${c}\nAllow: /\n`).join("\n")}\nSitemap: https://acme.com.au/sitemap.xml\n`,
      ),
    );
    expect(overridden.score).toBe(18);
  });

  it("a blocked user-triggered agent costs nothing, and says when its company says robots.txt may not apply", () => {
    const r = analyzeRobots(
      crawl(`${block("ChatGPT-User")}User-agent: Claude-User\nDisallow: /\n`),
    );
    expect(r.score).toBe(18);
    expect(r.findings.userAgentsBlocked).toEqual(
      expect.arrayContaining([
        { userAgent: "ChatGPT-User", robotsMayNotApply: true },
        { userAgent: "Claude-User", robotsMayNotApply: false },
      ]),
    );
  });

  it("every crawler on the page gets a verdict, Googlebot and Claude-SearchBot included", () => {
    const r = analyzeRobots(crawl(ALLOW_ALL));
    const agents = r.findings.botVerdicts?.map((v) => v.userAgent) ?? [];
    expect(agents).toEqual(expect.arrayContaining(["Googlebot", "Claude-SearchBot"]));
    expect(agents).toHaveLength(AI_BOTS.length);
  });
});

describe("tasks: a blocked search crawler, never a training crawler", () => {
  it("GPTBot blocked: no task; OAI-SearchBot or Googlebot blocked: a task naming it", async () => {
    const ctx = { organizationId: "org-1", brandId: "brand-1" };
    const robots = (text: string) => ({ status: "found" as const, text });
    await emitCdnJoinTasks(ctx, joinCrawlerAccess(robots(block("GPTBot")), [], true));
    expect(tasks.created).toEqual([]);
    await emitCdnJoinTasks(ctx, joinCrawlerAccess(robots(block("OAI-SearchBot")), [], true));
    await emitCdnJoinTasks(ctx, joinCrawlerAccess(robots(block("Googlebot")), [], true));
    expect(tasks.created.map((t) => t.title)).toEqual([
      "Unblock OAI-SearchBot in robots.txt",
      "Unblock Googlebot in robots.txt",
    ]);
  });

  it("a user-triggered agent robots.txt blocks: shown on CDN Shield, not a task", async () => {
    const rows = joinCrawlerAccess({ status: "found", text: block("ChatGPT-User") }, [], true);
    expect(rows.find((r) => r.crawlerName === "ChatGPT-User")?.verdict).toBe("self_blocked");
    await emitCdnJoinTasks({ organizationId: "org-1", brandId: "brand-1" }, rows);
    expect(tasks.created).toEqual([]);
  });
});

describe("PerplexityBot is a search crawler, Perplexity-User the agent that visits when someone asks", () => {
  it("classified as search, and never an active agent's visit", () => {
    expect(crawlerRoleOf("PerplexityBot")).toBe("search");
    expect(crawlerRoleOf("perplexity-user")).toBe("user");
    expect(isActiveAgentUserAgent("Mozilla/5.0 (compatible; PerplexityBot/1.0)")).toBe(false);
    expect(isActiveAgentUserAgent("Mozilla/5.0 (compatible; Perplexity-User/1.0)")).toBe(true);
  });
});

describe("nothing tells an owner to unblock a training crawler to be seen", () => {
  it("agent readiness asks about the search crawlers: a GPTBot block isn't a gap, an OAI-SearchBot one is", () => {
    expect(readinessRobots(block("GPTBot"))).toMatchObject({ allowsCrawlers: true, gap: null });
    const blocked = readinessRobots(block("OAI-SearchBot"));
    expect(blocked.allowsCrawlers).toBe(false);
    expect(blocked.gap).toBe(
      "robots.txt blocks OAI-SearchBot, a search crawler behind AI answers. Allow it if you want to appear in that engine's answers.",
    );
  });

  it("the suggested robots.txt allows search crawlers and assistants, not training crawlers or Google-Extended", () => {
    const agents = snippetAgents(undefined);
    expect(agents).toEqual(expect.arrayContaining([...SEARCH_CRAWLERS, "ChatGPT-User"]));
    for (const training of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended"]) {
      expect(agents).not.toContain(training);
    }
  });

  it("the Methods page and its seed say 'the search crawlers', the methodology says only they count", () => {
    const strip = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
    const seed = strip(readFileSync("db/seed/citability-methods/seed.ts", "utf8"));
    expect(seed).not.toContain("Explicitly allow GPTBot, ClaudeBot, PerplexityBot access.");
    expect(seed).not.toContain("Blocked bots cannot cite you at all");
    const methods = readFileSync("app/(auth)/methods/page.tsx", "utf8");
    expect(methods).toContain('"robots-allow-ai": {');
    expect(methods).toContain("Allow the search crawlers in robots.txt");
    const methodology = readFileSync("app/(marketing)/methodology/page.tsx", "utf8");
    expect(methodology).toContain(
      "The Technical score's robots.txt check counts only the search crawlers",
    );
    expect(methodology).toContain(
      "robots.txt is now scored on the search crawlers that put a site in AI answers",
    );
  });
});
