import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";

/**
 * Tests the content extraction strategy used by lib/crawler/index.ts fetchPage.
 * Mirrors the exact cheerio selectors and priority logic to guard against
 * chrome leaking into excerpt/textContent.
 */
function extractContent(html: string) {
  const $ = cheerio.load(html);
  const metaDesc = $('meta[name="description"]').attr("content")?.trim()
    || $('meta[property="og:description"]').attr("content")?.trim()
    || "";
  $("script, style, noscript, iframe, svg, template, nav, footer, header, aside").remove();
  $('[role="navigation"], [role="banner"], .skip-link, .skip-to-content').remove();
  $('a[href="#content"], a[href="#main-content"], a[href="#main"]').remove();
  $(".nav, .navbar, .menu, .top-bar, .announcement, .promo, .banner").remove();
  const contentEl = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const textContent = contentEl.text().replace(/\s+/g, " ").trim();
  const excerpt = metaDesc || textContent.slice(0, 200);
  return { textContent, excerpt };
}

const CHROME_PAGE = `<html>
<head>
  <meta name="description" content="Licensed blocked drain specialists serving Melbourne 24/7.">
  <title>Blocked Drains | Metro Plumbing</title>
</head>
<body>
  <div class="announcement">No Extra Charge After Hours</div>
  <a href="#content" class="skip-link">Skip to content</a>
  <header>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About Us</a>
      <a href="/blog">Blog</a>
    </nav>
  </header>
  <div class="navbar">
    <a href="/plumbing">Plumbing</a>
    <a href="/electrical">Electrical</a>
    <a href="/ac">Air Conditioning</a>
  </div>
  <main>
    <h1>Blocked Drains</h1>
    <p>Our expert plumbers clear blocked drains fast using CCTV inspection and hydro jetting.</p>
  </main>
  <footer>Copyright 2024 Metro Plumbing</footer>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KXD4DZ99" height="0" width="0"></iframe></noscript>
</body>
</html>`;

const NO_MAIN_PAGE = `<html>
<head><title>Gas Fitting</title></head>
<body>
  <div class="top-bar">Call us 1300 000 000</div>
  <div role="navigation">
    <a href="/">Home</a>
    <a href="/about">About</a>
  </div>
  <div role="banner">Free quotes available</div>
  <div class="content">
    <h1>Gas Fitting Services</h1>
    <p>We install and repair gas appliances across Melbourne.</p>
  </div>
  <footer>Footer text</footer>
</body>
</html>`;

const ARTICLE_PAGE = `<html>
<head>
  <meta property="og:description" content="How to prevent blocked drains in winter.">
</head>
<body>
  <header><nav><a href="/">Home</a></nav></header>
  <article>
    <h1>Winter Drain Maintenance Guide</h1>
    <p>As temperatures drop, your drainage system needs extra attention to prevent costly blockages.</p>
  </article>
  <aside>Related articles sidebar</aside>
</body>
</html>`;

describe("crawler content extraction", () => {
  it("uses meta description for excerpt when present", () => {
    const { excerpt } = extractContent(CHROME_PAGE);
    expect(excerpt).toBe("Licensed blocked drain specialists serving Melbourne 24/7.");
  });

  it("uses og:description when no meta description", () => {
    const { excerpt } = extractContent(ARTICLE_PAGE);
    expect(excerpt).toBe("How to prevent blocked drains in winter.");
  });

  it("extracts textContent from <main> when present, not chrome", () => {
    const { textContent } = extractContent(CHROME_PAGE);
    expect(textContent).toContain("Blocked Drains");
    expect(textContent).toContain("hydro jetting");
    expect(textContent).not.toContain("No Extra Charge");
    expect(textContent).not.toContain("Skip to content");
    expect(textContent).not.toContain("About Us");
    expect(textContent).not.toContain("Copyright");
  });

  it("extracts from <article> when no <main>", () => {
    const { textContent } = extractContent(ARTICLE_PAGE);
    expect(textContent).toContain("Winter Drain Maintenance");
    expect(textContent).toContain("costly blockages");
    expect(textContent).not.toContain("Related articles");
  });

  it("strips nav/banner chrome by role and class when no semantic tags", () => {
    const { textContent } = extractContent(NO_MAIN_PAGE);
    expect(textContent).toContain("Gas Fitting Services");
    expect(textContent).not.toContain("Call us 1300");
    expect(textContent).not.toContain("Free quotes");
    expect(textContent).not.toContain("Footer text");
  });

  it("strips GTM noscript/iframe", () => {
    const { textContent } = extractContent(CHROME_PAGE);
    expect(textContent).not.toContain("googletagmanager");
    expect(textContent).not.toContain("GTM-KXD4DZ99");
  });

  it("falls back to stripped body text for excerpt when no meta description", () => {
    const { excerpt } = extractContent(NO_MAIN_PAGE);
    expect(excerpt).toContain("Gas Fitting Services");
    expect(excerpt).not.toContain("Call us 1300");
  });

  it("REBREAK: removing content-region logic would extract chrome", () => {
    const $ = cheerio.load(CHROME_PAGE);
    $("script, style").remove();
    const rawBody = $("body").text().replace(/\s+/g, " ").trim();
    expect(rawBody.slice(0, 50)).toContain("No Extra Charge");
  });
});
