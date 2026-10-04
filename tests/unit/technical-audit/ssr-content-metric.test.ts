/**
 * ⚠️ YY — the SSR-check per-page metric was a false negative: it divided
 * real server-rendered content by 30% of the page's TOTAL raw bytes
 * (scripts/CSS/nav/footer included), so well-SSR'd pages read as "needs
 * review" purely because they also ship normal boilerplate markup. Task XX
 * confirmed no with-JS render exists anywhere -- there was never a real
 * "without vs with JS" comparison to make. Replaced with an honest
 * server-rendered word-count measure that the single no-JS fetch can
 * actually support.
 */
import { describe, expect, it } from "vitest";
import type { CrawlPage, CrawlResult } from "@/lib/crawler/types";
import {
  checkPageSSR,
  checkSSR,
  classifySsrContent,
  SSR_CONTENT_THRESHOLDS,
} from "@/lib/ssr-check/per-page";

function makePage(overrides: Partial<CrawlPage>): CrawlPage {
  return {
    url: "https://bondiplumbing.com.au/",
    statusCode: 200,
    title: "Bondi Plumbing | Plumber Bondi | Blocked Drains",
    textContent: "",
    wordCount: 0,
    excerpt: "",
    byline: null,
    html: "<html></html>",
    headers: {},
    ...overrides,
  };
}

function makeCrawl(pages: CrawlPage[]): CrawlResult {
  return {
    domain: "bondiplumbing.com.au",
    pages,
    robotsTxt: null,
    sitemapXml: null,
    crawledAt: new Date(),
    errors: [],
  };
}

describe("⚠️ YY — classifySsrContent", () => {
  it("below hasContentMin -> none", () => {
    expect(classifySsrContent(0)).toBe("none");
    expect(classifySsrContent(SSR_CONTENT_THRESHOLDS.hasContentMin - 1)).toBe("none");
  });
  it("between hasContentMin and goodContentMin -> thin", () => {
    expect(classifySsrContent(SSR_CONTENT_THRESHOLDS.hasContentMin)).toBe("thin");
    expect(classifySsrContent(SSR_CONTENT_THRESHOLDS.goodContentMin - 1)).toBe("thin");
  });
  it("at or above goodContentMin -> good", () => {
    expect(classifySsrContent(SSR_CONTENT_THRESHOLDS.goodContentMin)).toBe("good");
    expect(classifySsrContent(1454)).toBe("good"); // Bondi's real shape
  });
});

describe("⚠️ YY — checkPageSSR: honest content measure, not a byte-ratio", () => {
  it("Bondi's real shape (~1,454 words, heavy raw HTML) -> good / status ok, NOT 27%/review", () => {
    // A large raw HTML document (lots of script/style/nav/footer boilerplate,
    // the exact shape that broke the old htmlLen*0.3 ratio) but with real,
    // substantial body content.
    const bigBoilerplate = "<script>const x = 1;</script>".repeat(2000); // ~56KB of script alone
    const html = `<html><head>${bigBoilerplate}</head><body>
      <nav>Home About Services Contact</nav>
      <main>Real content paragraph. </main>
      <a href="tel:0290233243">Call us</a>
      <a href="mailto:info@bondiplumbing.com.au">Email</a>
      Book a service, get a quote, contact us today.
      <script type="application/ld+json">{"@type":"LocalBusiness"}</script>
      <footer>Footer links</footer>
    </body></html>`;

    const page = makePage({ html, wordCount: 1454 });
    const result = checkPageSSR(page, "bondiplumbing.com.au");

    expect(result.wordCount).toBe(1454);
    expect(result.contentVerdict).toBe("good");
    expect(result.status).toBe("ok"); // was "review" under the old ratio
    expect(result.criticalCtas).toBe("yes"); // tel + mailto + cta text, all real
    expect(result.schemaVisible).toBe(true); // real JSON-LD in this page's HTML
  });

  it("a genuinely thin/CSR page (little server-rendered content) -> review", () => {
    const html = `<html><head></head><body><div id="root"></div></body></html>`;
    const page = makePage({ html, wordCount: 5 });
    const result = checkPageSSR(page, "bondiplumbing.com.au");

    expect(result.contentVerdict).toBe("none");
    expect(result.status).toBe("review");
  });

  it("a thin-but-not-empty page (some content, below the good bar) -> review, verdict 'thin'", () => {
    const page = makePage({ html: "<html></html>", wordCount: 120 });
    const result = checkPageSSR(page, "bondiplumbing.com.au");

    expect(result.contentVerdict).toBe("thin");
    expect(result.status).toBe("review");
  });

  it("no longer exposes jsDisabledContentPct at all", () => {
    const page = makePage({ wordCount: 1454 });
    const result = checkPageSSR(page, "bondiplumbing.com.au");
    expect(result).not.toHaveProperty("jsDisabledContentPct");
  });
});

describe("⚠️ YY — the composite Technical Score (scoreContent) is unaffected", () => {
  it("checkSSR's own score still comes from wordCount > hasContentMin, independent of the per-page metric", async () => {
    // Homepage clears the real scoring floor (wordCount > 50) -> score 6,
    // exactly as before this task, even though its raw HTML is large enough
    // that the OLD per-page ratio would have failed it.
    const bigBoilerplate = "<script>const x = 1;</script>".repeat(2000);
    const homepage = makePage({
      html: `<html><head>${bigBoilerplate}</head><body>content</body></html>`,
      wordCount: 1454,
    });

    const result = await checkSSR("bondiplumbing.com.au", makeCrawl([homepage]));
    expect(result.score).toBe(6); // unchanged scoring path
  });

  it("checkSSR's score for a brand with no real content is still 0, unchanged", async () => {
    const homepage = makePage({ html: "<html></html>", wordCount: 5 });
    const result = await checkSSR("x.com.au", makeCrawl([homepage]));
    expect(result.score).toBe(0);
  });

  it("regression: Bondi's real content-quality shape is unchanged end to end", async () => {
    const homepage = makePage({ wordCount: 1454, html: "<html><body>x</body></html>" });
    const result = await checkSSR("bondiplumbing.com.au", makeCrawl([homepage]));
    expect(result.score).toBe(6); // matches task JJ/KK's confirmed 6/6
    expect(result.contentSSR.pages[0].status).toBe("ok"); // now consistent with the real score
  });
});
