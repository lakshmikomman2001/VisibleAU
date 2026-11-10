/**
 * Playwright-run follow-ups (10 Nov), part 7 -- the site check's bot is Vunnara-Audit-Bot (it was
 * VisibleAU-Audit-Bot), from one constant, lib/product.ts CRAWLER_USER_AGENT, whose "+URL" is the About page
 * that says what it is. Every request a crawl makes sends it: robots.txt, the sitemap and each page. An
 * environment variable no longer overrides it: the sprint 7 setup put the old name in CRAWLER_USER_AGENT.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite, DEFAULT_UA, fetchRobotsTxt } from "@/lib/crawler";
import { checkCrawlerAccess } from "@/lib/crawler/crawler-access";
import { checkMcpEndpoint } from "@/lib/retrieval/mcp-checker";
import { CRAWLER_NAME, CRAWLER_USER_AGENT } from "@/lib/product";

const sent: { url: string; ua: string | null }[] = [];

function stubSite() {
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      sent.push({ url, ua: new Headers(init?.headers).get("User-Agent") });
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
      if (url.endsWith("/sitemap.xml")) return new Response("<urlset></urlset>");
      return new Response(
        '<html><head><title>Home</title></head><body><main>Hello <a href="/about">About</a></main></body></html>',
        { headers: { "content-type": "text/html" } },
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the site check's user agent", () => {
  it("is Vunnara-Audit-Bot, linking the About page", () => {
    expect(CRAWLER_NAME).toBe("Vunnara-Audit-Bot");
    expect(CRAWLER_USER_AGENT).toBe("Vunnara-Audit-Bot/1.0 (+https://vunnara.com.au/about)");
    expect(DEFAULT_UA).toBe(CRAWLER_USER_AGENT);
  });

  it("is what every request of a crawl sends: robots.txt, the sitemap and each page", async () => {
    stubSite();
    const result = await crawlSite("example.com.au", { maxPages: 2 });
    expect(result.pages.map((p) => p.url)).toEqual([
      "https://example.com.au",
      "https://example.com.au/about",
    ]);
    expect(sent.map((r) => r.url)).toEqual([
      "https://example.com.au/robots.txt",
      "https://example.com.au/sitemap.xml",
      "https://example.com.au",
      "https://example.com.au/about",
    ]);
    expect(new Set(sent.map((r) => r.ua))).toEqual(new Set([CRAWLER_USER_AGENT]));
  });

  it("isn't overridden by a CRAWLER_USER_AGENT environment variable", async () => {
    vi.stubEnv(
      "CRAWLER_USER_AGENT",
      ["VisibleAU-Audit-Bot/1.0 (+https://visibleau", "com/bot)"].join("."),
    );
    stubSite();
    await crawlSite("example.com.au", { maxPages: 0 });
    expect(sent.map((r) => r.ua)).toEqual([CRAWLER_USER_AGENT, CRAWLER_USER_AGENT]);
  });

  // Stale since the af8de42..d1eb5a1 follow-ups (part 2): a caller could pass its own, and four checks passed
  // "GPTBot/1.1". There's no such option now; a caller that sneaks one in still sends ours.
  it("a caller can't ask for another one", async () => {
    stubSite();
    const opts = { maxPages: 0, userAgent: "GPTBot/1.1" };
    await crawlSite("example.com.au", opts);
    expect(sent.map((r) => r.ua)).toEqual([CRAWLER_USER_AGENT, CRAWLER_USER_AGENT]);
  });

  it("robots.txt on its own (CDN Shield) is read as us too, and a 404 is 'absent', a 503 'unreachable'", async () => {
    stubSite();
    expect(await fetchRobotsTxt("example.com.au")).toEqual({
      status: "found",
      text: "User-agent: *\nAllow: /\n",
    });
    expect(sent.map((r) => r.ua)).toEqual([CRAWLER_USER_AGENT]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    expect((await fetchRobotsTxt("example.com.au")).status).toBe("absent");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    expect((await fetchRobotsTxt("example.com.au")).status).toBe("unreachable");
  });

  it("the Crawler Logs page's check (robots.txt and the home page) sends only ours", async () => {
    stubSite();
    const check = await checkCrawlerAccess("example.com.au");
    expect(sent.map((r) => r.url)).toEqual([
      "https://example.com.au/robots.txt",
      "https://example.com.au",
    ]);
    expect(new Set(sent.map((r) => r.ua))).toEqual(new Set([CRAWLER_USER_AGENT]));
    expect(check.robots?.map((r) => r.sentence)).toContain(
      "robots.txt allows GPTBot (its rules for every crawler, User-agent: *, don't block it)",
    );
    expect(check.checkerRefused).toBe(false);
  });

  it("the MCP check sends ours (it sent the old name's VisibleAU-MCP-Check/1.0)", async () => {
    stubSite();
    await checkMcpEndpoint("example.com.au");
    expect(sent.length).toBeGreaterThan(0);
    expect(new Set(sent.map((r) => r.ua))).toEqual(new Set([CRAWLER_USER_AGENT]));
  });
});
