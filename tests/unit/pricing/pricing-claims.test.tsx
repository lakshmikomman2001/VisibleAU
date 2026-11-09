/**
 * Brand-feature locks and pricing claims (8 Nov), part 3 (Sri, decision 3: "pricing promises must be true
 * for a one-person company today") -- the pricing page promises only what's delivered. Nothing backed
 * "Dedicated support", "SLA guarantee", "Dedicated account manager" or "SSO & SAML" (no written SLA, no
 * account managers, no SSO set up -- better-auth's SSO plugin isn't installed), so they're gone; support is
 * "Priority email support" from Agency up, and integrations are "(by arrangement)". The words live in
 * lib/pricing/tiers.ts alone, and the page prints them from there.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  COMPARISON_ROWS,
  cardFeatures,
  PRIORITY_EMAIL_SUPPORT,
  TIER_DEFINITIONS,
} from "@/lib/pricing/tiers";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-visibleau-region": "au" }),
}));
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
