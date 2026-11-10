/**
 * Regression follow-ups (9 Nov), part 6 -- every public URL the product prints is on the production site, from
 * one constant (lib/product.ts SITE_URL, with PRODUCT_NAME and the contact addresses), and points at a page that
 * exists. They named the product's old domain: the crawler's "+URL" (a /bot page that never existed), the SARIF
 * export's help links (/docs/scoring), the crawler-tracking snippet's endpoint (an api. host this app never
 * served) and the metadata's canonical links.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_UA } from "@/lib/crawler";
import { buildSarif } from "@/lib/exports/sarif";
import { PRODUCT_NAME, SITE_URL, TRACKING_SNIPPET_PATH } from "@/lib/product";
import { listFiles, readSourcesBeforeAll, sourceText } from "@/tests/helpers/source-files";

const SHIPPED = ["app", "components", "lib", "inngest", "public"];
const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|txt|xml|html|css|svg|md)$/;
const OLD_DOMAIN = new RegExp(["visibleau", "com"].join("\\."), "i");

/** A marketing page's file for a path on the site ("/about" -> app/(marketing)/about/page.tsx). */
const pageFor = (path: string) => join("app/(marketing)", path === "/" ? "" : path, "page.tsx");

readSourcesBeforeAll(SHIPPED, TEXT_FILE);

describe("the product's old domain", () => {
  it("is nowhere in the app, its components, libraries, jobs or public files, comments included", () => {
    const files = listFiles(SHIPPED).filter((f) => TEXT_FILE.test(f));
    expect(files.length).toBeGreaterThan(700);
    expect(files.filter((f) => OLD_DOMAIN.test(sourceText(f)))).toEqual([]);
  });
});

describe("each public URL is the production site's and opens a page that exists", () => {
  it("the crawler's user agent links its About page", () => {
    const link = /\(\+(https:\/\/[^)\s]+)\)/.exec(DEFAULT_UA)?.[1];
    expect(link).toBe(`${SITE_URL}/about`);
    expect(existsSync(pageFor(new URL(link ?? SITE_URL).pathname))).toBe(true);
  });

  it("the SARIF export names the product and links the methodology page from every rule", () => {
    const { driver } = buildSarif({
      id: "a1",
      brandId: "b1",
      createdAt: new Date("2026-11-09T00:00:00.000Z"),
      headline: { status: "insufficient_data", reason: "no_answers" },
      sampleCount: 0,
      mentionDetail: { mentionedCount: 0, rankedCount: 0, medianPosition: null, sourcedCount: 0 },
    }).runs[0].tool;
    expect(driver.name).toBe(PRODUCT_NAME);
    expect(driver.informationUri).toBe(SITE_URL);
    expect(new Set(driver.rules.map((r) => r.helpUri))).toEqual(
      new Set([`${SITE_URL}/methodology`]),
    );
    expect(existsSync(pageFor("/methodology"))).toBe(true);
  });

  it("the crawler-tracking snippet posts to this app's own /api/visit on the production site", () => {
    // Renamed from public/visibleau-snippet.js (VISIBLEAU_API) on 10 Nov, Playwright-run follow-ups part 7.
    const snippet = sourceText(`public${TRACKING_SNIPPET_PATH}`);
    const endpoint = /var VUNNARA_API = "([^"]+)";/.exec(snippet)?.[1];
    expect(endpoint).toBe(`${SITE_URL}/api/visit`);
    expect(existsSync("app/api/visit/route.ts")).toBe(true);
    expect(snippet).not.toMatch(/VisibleAU/);
  });

  it("the sitemap and robots.txt name the same site", () => {
    const locs = [...sourceText("public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1],
    );
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(new URL(loc).origin).toBe(SITE_URL);
    expect(sourceText("public/robots.txt")).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it("the About and Methodology pages say the product's name, not the old one", () => {
    for (const page of [pageFor("/about"), pageFor("/methodology")]) {
      const code = sourceText(page).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, page).not.toMatch(/VisibleAU/);
      expect(code, page).toContain("{PRODUCT_NAME}");
    }
  });
});
