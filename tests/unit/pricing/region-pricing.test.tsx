/**
 * Playwright-run follow-ups (10 Nov), part 8 -- what each region's /pricing shows, now that the region reaches
 * the page (the middleware set it on the response, so every visitor got AU's). Only what lib/pricing/tiers.ts
 * defines: its prices are AUD, and nothing converts them.
 *
 * GST-free pricing (11 Nov): the ABN isn't registered for GST (lib/product.ts GST_REGISTERED = false), so a
 * region changes one thing, the Free card (shown where FREE_TIER_ENABLED_<REGION> is "true"): every region
 * gets the same price per plan, no inc/ex toggle and one line, "Prices are in Australian dollars. No GST is
 * charged." Registered (the table's gstRegistered), the pricing until 11 Nov is unchanged: GST included for AU
 * and excluded (the same AUD price less 10%) everywhere else, where the toggle starts on "ex GST".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Region } from "@/db/schema/enums";
import { formatAud, priceExGst } from "@/lib/pricing/gst";
import { TIER_DEFINITIONS } from "@/lib/pricing/tiers";

const visitor = vi.hoisted(() => ({ region: null as string | null }));
vi.mock("next/headers", async () => {
  const { REGION_HEADER } = await import("@/lib/region/header");
  return {
    headers: async () =>
      new Headers(visitor.region ? { [REGION_HEADER]: visitor.region } : undefined),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const NO_GST_NOTE = "Prices are in Australian dollars. No GST is charged.";
// What the registered path says (the notes until 11 Nov), word for word.
const INC_GST_NOTE = "All prices in AUD. Prices include 10% GST for Australian customers.";
const EX_GST_NOTE = "All prices in AUD. GST of 10% applies to Australian customers at checkout.";
const REGIONS: Region[] = ["au", "nz", "uk", "us", "ca", "eu"];
const PRICED = TIER_DEFINITIONS.filter((t) => t.key !== "free" && t.key !== "enterprise");

async function pricingHtml(region: string | null): Promise<string> {
  visitor.region = region;
  const { default: PricingPage } = await import("@/app/(marketing)/pricing/page");
  return renderToStaticMarkup(await PricingPage());
}

/** One plan card's HTML, or null when the page has no such card. */
function card(html: string, key: string): string | null {
  const start = html.indexOf(`data-plan-card="${key}"`);
  if (start < 0) return null;
  const next = html.indexOf('data-plan-card="', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}

// The page's first import and render can take longer than a test's 5 s under load; done once here.
beforeAll(async () => {
  await pricingHtml(null);
}, 60_000);
afterEach(() => vi.unstubAllEnvs());

describe("each region's pricing page, not registered for GST (GST_REGISTERED = false)", () => {
  it.each(
    REGIONS,
  )("%s: tiers.ts's AUD prices, the same in every region, the Free card only where its flag is on", async (region) => {
    for (const freeOn of [true, false]) {
      vi.stubEnv(`FREE_TIER_ENABLED_${region.toUpperCase()}`, freeOn ? "true" : "false");
      const html = await pricingHtml(region);
      expect(html).toContain(`data-pricing-region="${region}"`);
      expect(card(html, "free") !== null, `${region} Free card, flag ${freeOn}`).toBe(freeOn);
      expect(html).toContain(NO_GST_NOTE);
      expect(html).not.toContain("data-inc-ex-toggle");
      for (const tier of PRICED) {
        expect(card(html, tier.key), `${region} ${tier.key}`).toContain(
          `${formatAud(tier.monthlyPriceCentsIncGst)}</span>`,
        );
      }
      expect(card(html, "enterprise")).toContain("Custom");
      // Nothing about GST but the one line saying none is charged.
      expect(html.replace(NO_GST_NOTE, "")).not.toMatch(/GST/);
      // No other currency anywhere: tiers.ts defines AUD only.
      expect(html).not.toMatch(/US\$|NZ\$|C\$|£|€|USD|NZD|GBP|EUR|CAD/);
    }
  });

  it("the plans cost A$99, A$299, A$499 and A$1,499 a month, Enterprise is Custom", async () => {
    const html = await pricingHtml("uk");
    expect(card(html, "starter")).toContain("A$99</span>");
    expect(card(html, "growth")).toContain("A$299</span>");
    expect(card(html, "agency")).toContain("A$499</span>");
    expect(card(html, "agency_pro")).toContain("A$1,499</span>");
    expect(card(html, "enterprise")).toContain("Custom");
  });

  it("with no region on the request (no middleware ran), the AU page", async () => {
    const html = await pricingHtml(null);
    expect(html).toContain('data-pricing-region="au"');
    expect(html).toContain(NO_GST_NOTE);
  });
});

// Only what the page showed until 11 Nov -- its text, the toggle's name and the prices -- so this passes on the
// code before the switch (which had no gstRegistered prop and always priced this way) as it does with it on.
describe("registered for GST (GST_REGISTERED = true): the pricing until 11 Nov, unchanged", () => {
  it.each(
    REGIONS,
  )("%s: inc GST for AU, the same AUD price less 10% elsewhere, with the toggle", async (region) => {
    const au = region === "au";
    const { default: PricingTableClient } = await import(
      "@/components/domain/pricing/pricing-table-client"
    );
    const html = renderToStaticMarkup(
      <PricingTableClient showFreeTier defaultGstInclusive={au} gstRegistered />,
    );
    const text = html
      .replace(/<!-- -->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    expect(text).toContain(au ? INC_GST_NOTE : EX_GST_NOTE);
    expect(html).toContain('aria-label="Toggle GST inclusive pricing"');
    expect(text).toMatch(/ex GST\s+inc GST/);
    for (const tier of PRICED) {
      const cents = tier.monthlyPriceCentsIncGst;
      expect(card(html, tier.key), `${region} ${tier.key}`).toContain(
        `${formatAud(au ? cents : priceExGst(cents))}</span>`,
      );
    }
  });
});
