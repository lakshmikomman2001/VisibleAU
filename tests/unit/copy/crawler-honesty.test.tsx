/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 -- what the public pages and the plan copy say about our
 * checker matches what it does. /about said four checks "send GPTBot's user agent instead, so they get the page
 * GPTBot gets", and the plan copy sold a check of "Whether your CDN or firewall blocks the AI crawlers that
 * visit" -- testable from outside only by pretending to be them. Neither is true or promised now: every request
 * is ours, robots.txt is read per crawler, and a CDN can't be tested from outside (the logs show the visits).
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CRAWLER_USER_AGENT } from "@/lib/product";
import { BRAND_FEATURES } from "@/lib/pricing/brand-features";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/headers", async () => {
  const { REGION_HEADER } = await import("@/lib/region/header");
  return { headers: async () => new Headers({ [REGION_HEADER]: "au" }) };
});

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

async function render(
  load: () => Promise<{ default: () => ReactElement | Promise<ReactElement> }>,
) {
  const Page = (await load()).default;
  return text(renderToStaticMarkup(await Page()));
}

const PUBLIC_ROOTS = [
  "app/(marketing)",
  "components/domain/landing",
  "components/domain/pricing",
  "lib/pricing",
];
readSourcesBeforeAll(PUBLIC_ROOTS);

let about = "";
let methodology = "";
beforeAll(async () => {
  about = await render(() => import("@/app/(marketing)/about/page"));
  methodology = await render(() => import("@/app/(marketing)/methodology/page"));
}, 60_000);

describe("/about says what the checker does", () => {
  it("every request is our user agent, and never another company's", () => {
    expect(about).toContain(`Every request identifies itself as ${CRAWLER_USER_AGENT}`);
    expect(about).toContain("we never send another company's crawler name");
  });

  it("no longer says any check sends GPTBot's user agent", () => {
    expect(about).not.toMatch(/GPTBot's user agent/);
    expect(about).not.toMatch(/the page GPTBot gets/);
  });

  it("robots.txt per crawler, and the CDN can't be tested from outside (the logs show the visits)", () => {
    expect(about).toContain("we read the rules its robots.txt sets for that crawler");
    expect(about).toContain("can't be tested from outside without pretending to be it");
    expect(about).toContain("server logs");
  });
});

describe("the methodology says the same", () => {
  it("has the AI Crawler Access section: our user agent, robots.txt per crawler, no CDN test", () => {
    expect(methodology).toContain("AI Crawler Access");
    expect(methodology).toContain(CRAWLER_USER_AGENT);
    expect(methodology).toContain("RFC 9309");
    expect(methodology).toContain("can't be tested from outside without pretending to be it");
  });
});

describe("no plan or public page promises a CDN test as the crawler", () => {
  it("the CDN Shield feature's plan copy says what's really checked", () => {
    expect(BRAND_FEATURES.cdn_shield_check.name).toBe("AI crawler access check");
    expect(BRAND_FEATURES.cdn_shield_check.description).toBe(
      "What your robots.txt lets each AI crawler read, beside its verified visits in your server logs",
    );
  });

  it("no public page, pricing component or plan file says it tests a CDN or firewall as a crawler", () => {
    const PROMISES = [
      /whether your CDN or firewall blocks/i,
      /test(s|ing)? (your|the) (CDN|firewall)/i,
      /as (each|an|every) AI crawler/i,
      /pretend(s|ing)? to be (GPTBot|an AI crawler)/i,
      /CDN (is )?blocking AI/i,
    ];
    const files = sourcePaths(PUBLIC_ROOTS);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      // The code, not its comments (a comment may quote the old promise to say why it's gone).
      const src = sourceText(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
      for (const promise of PROMISES) expect(src, `${file}: ${promise}`).not.toMatch(promise);
    }
  });
});
