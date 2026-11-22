/**
 * Brand-feature locks and pricing claims (8 Nov), part 3 (Sri, decision 3: "pricing promises must be true
 * for a one-person company today") -- the pricing page promises only what's delivered. Nothing backed
 * "Dedicated support", "SLA guarantee", "Dedicated account manager" or "SSO & SAML" (no written SLA, no
 * account managers, no SSO set up -- better-auth's SSO plugin isn't installed), so they're gone; support is
 * "Priority email support" from Agency up, and integrations are "(by arrangement)". The words live in
 * lib/pricing/tiers.ts alone, and the page prints them from there.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import {
  COMPARISON_ROWS,
  cardFeatures,
  comparisonIncludes,
  PRIORITY_EMAIL_SUPPORT,
  TIER_DEFINITIONS,
  tierRank,
} from "@/lib/pricing/tiers";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

// The middleware puts the region on the request (lib/region/header.ts; Playwright-run follow-ups, 10 Nov, part 8).
vi.mock("next/headers", async () => {
  const { REGION_HEADER } = await import("@/lib/region/header");
  return { headers: async () => new Headers({ [REGION_HEADER]: "au" }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** /pricing as a visitor reads it: the whole page, its text only. */
async function pricingPage(): Promise<string> {
  const { default: PricingPage } = await import("@/app/(marketing)/pricing/page");
  return renderToStaticMarkup(await PricingPage())
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

const GONE: Array<[string, RegExp]> = [
  ["Dedicated support", /Dedicated support/i],
  ["SLA guarantee", /\bSLA\b/],
  ["Dedicated account manager", /account manager/i],
  ["SSO & SAML", /\bSSO\b|\bSAML\b/],
  ["Priority support (unqualified)", /Priority support/i],
  ["Custom integrations, as a promise", /Custom integrations(?! \(by arrangement\))/],
  // 9 Nov (part 8): no setting changes a workspace's audit frequency.
  ["Custom audit frequency", /Custom audit frequency|Audit frequency[^.]{0,80}\bCustom\b/i],
];

const card = (key: string) =>
  cardFeatures(TIER_DEFINITIONS.find((t) => t.key === key) ?? TIER_DEFINITIONS[0]);

// The page's first import and render took longer than the first test's 5 s under load (10 Nov, twice in
// `vitest related` runs); done once here, so each test times only its own check.
beforeAll(async () => {
  await pricingPage();
}, 60_000);

describe("the pricing page promises only what's delivered", () => {
  it.each(GONE)("no %s", async (_name, phrase) => {
    expect(await pricingPage()).not.toMatch(phrase);
  });

  it("support is email, answered first from Agency up: on Agency's card and in the table", async () => {
    expect(card("agency")).toContain(PRIORITY_EMAIL_SUPPORT);
    // Agency Pro and Enterprise have it through "Everything in ...", not a promise of their own.
    expect(card("agency_pro")).toContain("Everything in Agency");
    expect(card("agency_pro").join(" ")).not.toMatch(/support/i);
    expect(COMPARISON_ROWS).toContainEqual({ label: PRIORITY_EMAIL_SUPPORT, from: "agency" });
    expect(await pricingPage()).toContain("Priority email support");
  });

  it("Enterprise: everything in Agency Pro, and integrations by arrangement -- nothing else promised", () => {
    const lines = card("enterprise");
    expect(lines).toContain("Custom integrations (by arrangement)");
    // 9 Nov (part 8): a frequency nothing can set is a conversation, not a setting.
    expect(lines).toContain("Audit frequency by arrangement");
    expect(lines.join(" ")).not.toMatch(/Custom audit frequency/i);
    expect(TIER_DEFINITIONS.find((t) => t.key === "enterprise")?.frequency).toBe("By arrangement");
    expect(lines).toContain("Everything in Agency Pro");
    expect(lines.join(" ")).not.toMatch(/SSO|SAML|SLA|account manager|dedicated/i);
  });

  // S01 part 0 (D-RT1 revised): reports are Growth and up (lib/pricing/brand-features.ts), so no card below
  // Growth promises one. Starter's card listed "Email reports", which Starter can't generate.
  it("no plan below the reports plan promises reports, on its card or in the table", () => {
    const reportsFrom = brandFeaturePlan("reports");
    const below = TIER_DEFINITIONS.filter((t) => tierRank(t.key) < tierRank(reportsFrom));
    expect(below.map((t) => t.key)).toEqual(["free", "starter"]);
    for (const tier of below) {
      expect(cardFeatures(tier).join(" | ")).not.toMatch(/report|PDF/i);
    }
    for (const row of COMPARISON_ROWS) {
      const name = "label" in row ? row.label : row.feature;
      if (!/report|PDF/i.test(name)) continue;
      for (const tier of below) expect(comparisonIncludes(row, tier.key), name).not.toBe(true);
    }
  });

  it("no comparison row promises SSO", () => {
    expect(
      COMPARISON_ROWS.map((row) => ("label" in row ? row.label : row.feature)),
    ).not.toContainEqual(expect.stringMatching(/SSO|SAML/));
  });
});

/** The shipped code that names a promise: only lib/pricing/tiers.ts may. */
const SHIPPED = ["app", "components", "lib"];
function sourceFiles(): string[] {
  return sourcePaths(SHIPPED)
    .filter((path) => !/\.test\.tsx?$/.test(path))
    .sort();
}
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("the promises are worded in one place", () => {
  // One walk per file, cached (tests/helpers/source-files.ts); the test reads the cache.
  readSourcesBeforeAll(SHIPPED);

  it("only lib/pricing/tiers.ts names them", () => {
    const naming = sourceFiles().filter((file) =>
      /Priority email support|by arrangement|set up via API/.test(stripComments(sourceText(file))),
    );
    expect(naming).toEqual(["lib/pricing/tiers.ts"]);
  });
});

/**
 * 20 Nov (Sri's decision, part 3): no compliance or certification claim anywhere a customer reads it -- pages,
 * components, emails (lib/email), the PDF (lib/reports, lib/pdf) -- but the privacy policy and the terms, which may name
 * the law. The sign-in and sign-up pages said "AU-first vertical content & compliance"; the landing page said
 * "Australian Privacy Act 1988 compliant" until 19 Nov.
 */
const CLAIM_WORDS =
  /\bcomplian(?:ce|t)\b|\bcertif(?:ied|ication|ications|icate)\b|\bGDPR\b|\bISO ?27001\b|\bSOC ?2\b|\bHIPAA\b|\baccredited\b/i;
/** Where the words may appear, and why: the law in the legal pages; audit questions about other businesses. */
const CLAIM_WORDS_ALLOWED: Record<string, string> = {
  "app/(marketing)/privacy/page.tsx": "the privacy policy names the law",
  "app/(marketing)/terms/page.tsx": "the terms name the law",
  "lib/prompts/templates.ts":
    "questions an audit asks AI engines about a kind of business, not a claim of ours",
};
const CUSTOMER_FACING = ["app", "components", "lib", "emails"];

describe("no compliance or certification claim outside /privacy and /terms", () => {
  readSourcesBeforeAll(CUSTOMER_FACING);

  it("no shipped file says compliant, compliance, certified or a certification name", () => {
    const claiming = sourcePaths(CUSTOMER_FACING)
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => !(path in CLAIM_WORDS_ALLOWED))
      .filter((path) => CLAIM_WORDS.test(stripComments(sourceText(path))));
    expect(claiming).toEqual([]);
  });

  it("the sign-in and sign-up pages share one list, and it says what the product does", async () => {
    const { AUTH_PAGE_FEATURES } = await import("@/lib/marketing/auth-features");
    expect(AUTH_PAGE_FEATURES[0]).toBe(
      "How often AI answers name your business, across the engines on your plan",
    );
    for (const form of [
      "app/sign-in/[[...sign-in]]/sign-in-form.tsx",
      "app/sign-up/[[...sign-up]]/sign-up-form.tsx",
    ]) {
      const text = sourceText(form);
      expect(text).toContain("const FEATURES = AUTH_PAGE_FEATURES;");
      expect(stripComments(text)).not.toMatch(CLAIM_WORDS);
    }
  });
});
