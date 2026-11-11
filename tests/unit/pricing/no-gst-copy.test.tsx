// @vitest-environment jsdom
/**
 * GST-free pricing (11 Nov) -- Sri: the ABN (35 523 139 837) is not registered for GST, so nothing may charge
 * GST, describe a price as including or excluding it, or show a GST amount. One switch, lib/product.ts
 * GST_REGISTERED (false); every word about GST comes from lib/pricing/gst.ts, which reads it.
 *
 * - The scan: no shipped code says "GST" outside lib/pricing/gst.ts, except the two places below that are about
 *   the audited businesses, not our prices (comments and import paths aside).
 * - Not registered: the pages that priced or labelled GST (pricing, the landing teaser and FAQ, Terms, billing)
 *   render no GST but the two sentences Sri gave: "No GST is charged." and the Terms' "not registered for GST".
 * - Registered: each sentence is the one shown until 11 Nov, word for word.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  billingRegionLabel,
  displayPriceCents,
  formatAud,
  GST_TOGGLE_LABEL,
  gstLabel,
  priceExGst,
  priceTaxSuffix,
  pricingMetaDescription,
  pricingNote,
  teaserPriceLine,
  termsPricesSentence,
} from "@/lib/pricing/gst";
import type { RenewalLine } from "@/lib/pricing/renewal";
import { GST_REGISTERED } from "@/lib/product";
import {
  NON_TEST_ROOTS,
  readSourcesBeforeAll,
  sourcePaths,
  sourceText,
} from "../../helpers/source-files";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/settings/billing",
}));

const NO_GST_CHARGED = "Prices are in Australian dollars. No GST is charged.";
const TERMS_SENTENCE =
  "Prices are in Australian dollars. Vunnara is not registered for GST, so no GST is charged.";

/** Where "GST" may appear in shipped code besides lib/pricing/gst.ts, each with why. */
const NOT_OUR_PRICES: Record<string, string> = {
  "lib/prompts/templates.ts":
    "questions the audit asks AI engines about accounting software for Australian businesses",
  "app/(auth)/verticals/[packId]/page.tsx":
    "what the SaaS pack checks in an audited business's own AI answers (its pricing display)",
  "scripts/test-abn-lookup.ts":
    "a developer script that prints the ABN register's GST field for a looked-up business",
};

const SHIPPED = /\.(ts|tsx|js|jsx|mjs|html|txt|md|json)$/;
readSourcesBeforeAll([...NON_TEST_ROOTS, "public"], SHIPPED);

/** Code without comments, import lines or module paths: what could reach a page, an email or a PDF. */
function copyOf(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/["']@\/lib\/pricing\/gst["']/g, "");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the switch", () => {
  it("is off: the ABN isn't registered for GST (Sri, 11 Nov)", () => {
    expect(GST_REGISTERED).toBe(false);
  });
});

describe("no GST wording outside lib/pricing/gst.ts", () => {
  it("shipped code says GST only through the switch (or about an audited business, with why)", () => {
    const files = sourcePaths([...NON_TEST_ROOTS, "public"], SHIPPED);
    expect(files.length).toBeGreaterThan(500);
    const offenders = files
      .filter((path) => path !== "lib/pricing/gst.ts" && !NOT_OUR_PRICES[path])
      .flatMap((path) =>
        copyOf(sourceText(path))
          .split("\n")
          .map((line, i) => ({ line, at: `${path}:${i + 1}` }))
          .filter(({ line }) => /\bGST\b/i.test(line))
          .map(({ at, line }) => `${at}  ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("the allowed places still need it (the list can't rot)", () => {
    for (const [path, why] of Object.entries(NOT_OUR_PRICES)) {
      expect(sourceText(path), path).toMatch(/\bGST\b/);
      expect(why.length).toBeGreaterThan(20);
    }
  });
});

describe("not registered: nothing charges, includes or labels GST", () => {
  beforeAll(async () => {
    await import("@/components/domain/pricing/pricing-table-client");
    await import("@/app/(auth)/settings/billing/billing-view");
  }, 60_000);

  it("the copy says no GST is charged, in the two places Sri gave, and nothing else about it", () => {
    expect(pricingNote(true)).toBe(NO_GST_CHARGED);
    expect(pricingNote(false)).toBe(NO_GST_CHARGED);
    expect(termsPricesSentence()).toBe(TERMS_SENTENCE);
    expect(gstLabel(true)).toBeNull();
    expect(gstLabel(false)).toBeNull();
    for (const text of [
      pricingMetaDescription(),
      teaserPriceLine(),
      priceTaxSuffix(),
      billingRegionLabel(),
    ]) {
      expect(text).not.toMatch(/GST/);
    }
    expect(billingRegionLabel()).toBe("AU");
    // The list price for every region, inc or ex.
    expect(displayPriceCents(9900, false)).toBe(9900);
    expect(displayPriceCents(9900, true)).toBe(9900);
  });

  it("the pricing table, for a non-AU visitor too: the list prices, no toggle, the one line", async () => {
    const { default: PricingTableClient, OneOffAuditCard } = await import(
      "@/components/domain/pricing/pricing-table-client"
    );
    for (const defaultGstInclusive of [true, false]) {
      const html = renderToStaticMarkup(
        <PricingTableClient showFreeTier defaultGstInclusive={defaultGstInclusive} />,
      );
      expect(html).toContain(NO_GST_CHARGED);
      expect(html).toContain("A$99</span>");
      expect(html).toContain("A$1,499</span>");
      expect(html).not.toContain("A$90</span>");
      expect(html.replace(NO_GST_CHARGED, "")).not.toMatch(/GST/);
    }
    const oneOff = renderToStaticMarkup(<OneOffAuditCard gstInclusive={false} />);
    expect(oneOff).toContain("A$299");
    expect(oneOff).not.toMatch(/GST/);
  }, 30_000);

  it("the landing teaser, the FAQ and the Terms", async () => {
    const { PricingTeaser } = await import("@/components/domain/landing/pricing-teaser");
    expect(renderToStaticMarkup(<PricingTeaser />)).not.toMatch(/GST/);
    const { FaqSection } = await import("@/components/domain/landing/faq-section");
    expect(renderToStaticMarkup(<FaqSection />)).not.toMatch(/GST/);
    const Terms = (await import("@/app/(marketing)/terms/page")).default;
    const terms = renderToStaticMarkup(<Terms />);
    expect(terms).toContain(TERMS_SENTENCE);
    expect(terms.replace(TERMS_SENTENCE, "")).not.toMatch(/GST/);
  }, 30_000);

  it("the billing page's Region reads AU", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    const { default: BillingView } = await import("@/app/(auth)/settings/billing/billing-view");
    const { container } = render(
      <BillingView
        tier="starter"
        tierName="Starter"
        monthlyPrice="A$99"
        billingInterval="monthly"
        cancelAtPeriodEnd={false}
        renewal={{ kind: "renews", label: "Renews", value: "1 December 2026" } as RenewalLine}
        hasSubscription
        stripeCustomerId="cus_test"
        maxScheduled={1}
        frequency="weekly"
        success={false}
        reason={null}
      />,
    );
    expect(screen.getByText("Region").nextElementSibling).toHaveTextContent(/^AU$/);
    expect(container.textContent).not.toMatch(/GST/);
  });
});

describe("registered (GST_REGISTERED = true): the wording until 11 Nov, word for word", () => {
  it("each sentence, label and price", () => {
    expect(pricingNote(true, true)).toBe(
      "All prices in AUD. Prices include 10% GST for Australian customers.",
    );
    expect(pricingNote(false, true)).toBe(
      "All prices in AUD. GST of 10% applies to Australian customers at checkout.",
    );
    expect(gstLabel(true, true)).toBe("inc GST");
    expect(gstLabel(false, true)).toBe("ex GST");
    expect(GST_TOGGLE_LABEL).toBe("Toggle GST inclusive pricing");
    expect(pricingMetaDescription(true)).toBe(
      "Per-brand flat-rate pricing for AI search visibility audits. No per-prompt surprises. All prices in AUD inc GST.",
    );
    expect(teaserPriceLine(true)).toBe("All prices inc. GST. Cancel any time.");
    expect(priceTaxSuffix(true)).toBe(" inc. GST");
    expect(billingRegionLabel(true)).toBe("AU (GST inclusive)");
    expect(termsPricesSentence(true)).toBe("All prices are in Australian dollars and include GST.");
    expect(displayPriceCents(9900, true, true)).toBe(9900);
    expect(displayPriceCents(9900, false, true)).toBe(priceExGst(9900));
    expect(displayPriceCents(0, false, true)).toBe(0);
  });

  it("the one-off card says inc / ex GST", async () => {
    const { OneOffAuditCard } = await import("@/components/domain/pricing/pricing-table-client");
    expect(renderToStaticMarkup(<OneOffAuditCard gstInclusive gstRegistered />)).toContain(
      "inc GST · ",
    );
    expect(renderToStaticMarkup(<OneOffAuditCard gstInclusive={false} gstRegistered />)).toContain(
      formatAud(priceExGst(29900)),
    );
  });
});
