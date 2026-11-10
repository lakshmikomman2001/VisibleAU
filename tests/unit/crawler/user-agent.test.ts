/**
 * Playwright-run follow-ups (10 Nov), part 7 -- the site check's bot is Vunnara-Audit-Bot (it was
 * VisibleAU-Audit-Bot), from one constant, lib/product.ts CRAWLER_USER_AGENT, whose "+URL" is the About page
 * that says what it is. Every request a crawl makes sends it: robots.txt, the sitemap and each page. An
 * environment variable no longer overrides it: the sprint 7 setup put the old name in CRAWLER_USER_AGENT.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite, DEFAULT_UA } from "@/lib/crawler";
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

  it("a caller that asks for another one still gets it", async () => {
    stubSite();
    await crawlSite("example.com.au", { maxPages: 0, userAgent: "GPTBot/1.1" });
    expect(sent.map((r) => r.ua)).toEqual(["GPTBot/1.1", "GPTBot/1.1"]);
  });
});
