import { describe, it, expect } from "vitest";
import { generateLlmsTxt } from "@/lib/retrieval/llmstxt-generator";
import type { CrawlPage } from "@/lib/crawler/types";

function makePage(url: string, title: string): CrawlPage {
  return {
    url,
    statusCode: 200,
    title,
    textContent: "Some content",
    wordCount: 100,
    excerpt: "A brief excerpt about the page content for testing purposes.",
    byline: null,
    html: "<html></html>",
    headers: {},
  };
}

describe("generateLlmsTxt", () => {
  it("generates content with brand name header", () => {
    const result = generateLlmsTxt("Acme Co", "acme.com", [
      makePage("https://acme.com/", "Home"),
    ], null);
    expect(result.content).toContain("# Acme Co");
    expect(result.content).toContain("acme.com");
  });

  it("depth score increases with pages", () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      makePage(`https://acme.com/page-${i}`, `Page ${i}`),
    );
    const result = generateLlmsTxt("Acme", "acme.com", pages, null);
    expect(result.depthScore).toBeGreaterThan(5);
  });

  it("robots.txt adds 2 to depth score", () => {
    const noRobots = generateLlmsTxt("A", "a.com", [], null);
    const withRobots = generateLlmsTxt("A", "a.com", [], "User-agent: *\nAllow: /");
    expect(withRobots.depthScore - noRobots.depthScore).toBe(2);
  });

  it("about/contact/faq/services each add 1 to depth", () => {
    const pages = [
      makePage("https://a.com/about", "About"),
      makePage("https://a.com/contact", "Contact"),
      makePage("https://a.com/faq", "FAQ"),
      makePage("https://a.com/services", "Services"),
    ];
    const result = generateLlmsTxt("A", "a.com", pages, null);
    expect(result.depthScore).toBeGreaterThanOrEqual(8);
  });

  it("depth caps at 18", () => {
    const pages = Array.from({ length: 25 }, (_, i) =>
      makePage(`https://a.com/${["about", "contact", "faq", "services"][i % 4] ?? `p${i}`}`, `Page ${i}`),
    );
    const result = generateLlmsTxt("A", "a.com", pages, "robots");
    expect(result.depthScore).toBeLessThanOrEqual(18);
  });

  it("strips GTM noscript/iframe markup from page descriptions", () => {
    const polluted: CrawlPage = {
      ...makePage("https://a.com/", "Home"),
      excerpt:
        'Welcome to Acme <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KXD4DZ99" height="0" width="0" style="display:none;visibility:hidden"></iframe> best services',
    };
    const result = generateLlmsTxt("A", "a.com", [polluted], null);
    expect(result.content).not.toContain("<iframe");
    expect(result.content).not.toContain("googletagmanager");
    expect(result.content).toContain("Welcome to Acme");
    expect(result.content).toContain("best services");
  });

  it("strips any residual HTML tags from excerpts", () => {
    const withTags: CrawlPage = {
      ...makePage("https://a.com/about", "About"),
      excerpt: 'About us <script>alert("xss")</script> we are <noscript>fallback</noscript> great',
    };
    const result = generateLlmsTxt("A", "a.com", [withTags], null);
    expect(result.content).not.toMatch(/<[a-z][^>]*>/i);
    expect(result.content).toContain("About us");
  });

  it("page descriptions are per-page DISTINCT (not identical chrome)", () => {
    const pages: CrawlPage[] = [
      { ...makePage("https://a.com/blocked-drains", "Blocked Drains"), excerpt: "Expert blocked drain clearing services across Melbourne suburbs" },
      { ...makePage("https://a.com/gas-fitting", "Gas Fitting"), excerpt: "Licensed gas fitting and appliance installation for homes" },
      { ...makePage("https://a.com/about", "About Us"), excerpt: "Family-owned plumbing business serving Melbourne since 1998" },
    ];
    const result = generateLlmsTxt("Metro Plumbing", "metro.com.au", pages, null);
    const descLines = result.content.split("\n").filter((l) => l.startsWith("- ["));
    const descriptions = descLines.map((l) => l.split(": ").slice(1).join(": "));
    const unique = new Set(descriptions);
    expect(unique.size).toBe(descriptions.length);
  });
});
