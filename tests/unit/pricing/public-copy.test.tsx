/**
 * Sri's decisions 1-3 (7 Nov) -- the public pages say what the product does. Every plan is scored
 * the same way, so "5-dimension scoring" is on every plan's card and in every plan's column; no page
 * says "7-layer" or calls the score a composite; and the one-off audit, which can't be bought yet, is
 * shown nowhere, with nothing linking to its checkout, until lib/pricing/tiers.ts's
 * ONE_OFF_AUDIT_AVAILABLE is turned on.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import PricingTableClient from "@/components/domain/pricing/pricing-table-client";
import { TierComparisonTable } from "@/components/domain/pricing/tier-comparison-table";
import { cardFeatures, ONE_OFF_AUDIT_AVAILABLE, TIER_DEFINITIONS } from "@/lib/pricing/tiers";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-visibleau-region": "au" }),
}));

const ROOT = join(__dirname, "../../..");
const PLANS = TIER_DEFINITIONS.map((t) => t.key);
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Every public page that renders without a database: the landing, pricing, methodology, about, privacy and terms pages. */
async function publicPages(): Promise<Record<string, string>> {
  const pages: Record<
    string,
    () => Promise<{ default: () => ReactElement | Promise<ReactElement> }>
  > = {
    "/": () => import("@/app/(marketing)/page"),
    "/pricing": () => import("@/app/(marketing)/pricing/page"),
    "/methodology": () => import("@/app/(marketing)/methodology/page"),
    "/about": () => import("@/app/(marketing)/about/page"),
    "/privacy": () => import("@/app/(marketing)/privacy/page"),
    "/terms": () => import("@/app/(marketing)/terms/page"),
  };
  const out: Record<string, string> = {};
  for (const [path, load] of Object.entries(pages)) {
    const Page = (await load()).default;
    out[path] = text(renderToStaticMarkup(await Page()));
  }
  return out;
}

/** The source of every public page and the components and copy they're built from. */
function publicSources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) {
        out.push({
          file: relative(ROOT, path).replace(/\\/g, "/"),
          src: readFileSync(path, "utf8"),
        });
      }
    }
  };
  for (const dir of ["app/(marketing)", "components/domain/landing", "components/domain/pricing"]) {
    walk(join(ROOT, dir));
  }
  out.push({
    file: "lib/pricing/tiers.ts",
    src: readFileSync(join(ROOT, "lib/pricing/tiers.ts"), "utf8"),
  });
  return out;
}

/** Every file under app/ and components/. */
function appSources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) {
        out.push({
          file: relative(ROOT, path).replace(/\\/g, "/"),
          src: readFileSync(path, "utf8"),
        });
      }
    }
  };
  walk(join(ROOT, "app"));
  walk(join(ROOT, "components"));
  return out;
}

const pricingHtml = () =>
  renderToStaticMarkup(
    createElement(PricingTableClient, { showFreeTier: true, defaultGstInclusive: true }),
  );

// A cold first render can outlast a test's 5 s on this machine; pay for it here.
beforeAll(async () => {
  await publicPages();
}, 60_000);

afterEach(() => {
  vi.doUnmock("@/lib/pricing/tiers");
  vi.resetModules();
});

describe("decisions 1 and 2: no page says 7-layer or composite score", () => {
  it("no public page says them", async () => {
    for (const [path, page] of Object.entries(await publicPages())) {
      expect(page, path).not.toMatch(/7-layer/i);
      expect(page, path).not.toMatch(/composite score/i);
    }
  });

  it("nor does any public page's source, or the plan copy", () => {
    const sources = publicSources();
    expect(sources.length).toBeGreaterThan(10);
    for (const { file, src } of sources) {
      expect(src, file).not.toMatch(/7-layer/i);
      expect(src, file).not.toMatch(/composite score/i);
    }
  });

  it("How it works says the score is how often AI answers mention the business", async () => {
    const landing = (await publicPages())["/"];
    expect(landing).toContain(
      "Your Visibility Score is how often AI answers mention your business, shown with where you're placed and which sources the answers cite, plus specific recommendations.",
    );
  });
});

describe("decision 1: 5-dimension scoring on every plan", () => {
  it("every plan's card says it, Free included", () => {
    const html = pricingHtml();
    const starts = [...html.matchAll(/data-plan-card="([^"]+)"/g)];
    expect(starts.map((s) => s[1])).toEqual(PLANS);
    starts.forEach((start, i) => {
      const card = html.slice(start.index, starts[i + 1]?.index ?? html.length);
      const lines = [...card.matchAll(/<li[^>]*data-card-line[^>]*>([\s\S]*?)<\/li>/g)].map((m) =>
        text(m[1]),
      );
      expect(lines, start[1]).toContain("5-dimension scoring");
    });
    for (const tier of TIER_DEFINITIONS)
      expect(cardFeatures(tier)).toContain("5-dimension scoring");
  });

  it("the comparison table ticks it in every plan's column", () => {
    const html = renderToStaticMarkup(createElement(TierComparisonTable, { showFreeTier: true }));
    const row = html.match(/<tr data-row="from:5-dimension scoring"[^>]*>([\s\S]*?)<\/tr>/)?.[1];
    expect(row, "no 5-dimension scoring row").toBeDefined();
    const cells = [
      ...(row ?? "").matchAll(/<td data-plan="([^"]+)" data-included="(true|false)"/g),
    ].map((m) => [m[1], m[2]]);
    expect(cells).toEqual(PLANS.map((key) => [key, "true"]));
  });

  it("no card calls a plan's score basic, or full", () => {
    for (const tier of TIER_DEFINITIONS) {
      expect(cardFeatures(tier).join(" | "), tier.key).not.toMatch(
        /basic visibility score|full .*scoring/i,
      );
    }
  });
});

describe("decision 3: the one-off audit is hidden until it can be bought", () => {
  it("the flag is off", () => {
    expect(ONE_OFF_AUDIT_AVAILABLE).toBe(false);
  });

  it("the pricing page shows no one-off audit card, price line or purchase link", async () => {
    const html = pricingHtml();
    expect(html).not.toContain("data-one-off-audit");
    expect(text(html)).not.toMatch(/one-off audit/i);
    expect(text(html)).not.toContain("without a subscription");
    const pricingPage = (await publicPages())["/pricing"];
    expect(pricingPage).not.toMatch(/one-off/i);
  });

  it("nothing in the app links to the one-off checkout, and its card is only ever shown behind the flag", () => {
    const sources = appSources();
    expect(sources.length).toBeGreaterThan(100);
    for (const { file, src } of sources) {
      expect(src, file).not.toMatch(/createOneOffCheckoutSession|one_off_audit/);
      for (const use of src.matchAll(/<OneOffAuditCard\b/g)) {
        const before = src.slice(Math.max(0, (use.index ?? 0) - 60), use.index);
        expect(before, `${file} shows OneOffAuditCard without the flag`).toMatch(
          /ONE_OFF_AUDIT_AVAILABLE &&\s*$/,
        );
      }
    }
  });

  it("turning the flag on is the one change that shows it again", async () => {
    vi.doMock("@/lib/pricing/tiers", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/pricing/tiers")>()),
      ONE_OFF_AUDIT_AVAILABLE: true,
    }));
    const { default: Fresh } = await import("@/components/domain/pricing/pricing-table-client");
    const html = renderToStaticMarkup(
      createElement(Fresh, { showFreeTier: true, defaultGstInclusive: true }),
    );
    expect(html).toContain("data-one-off-audit");
    expect(text(html)).toContain("Purchase one-off audit");
  });
});
