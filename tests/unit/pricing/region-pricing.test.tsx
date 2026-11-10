/**
 * Playwright-run follow-ups (10 Nov), part 8 -- what each region's /pricing shows, now that the region reaches
 * the page (the middleware set it on the response, so every visitor got AU's). Only what lib/pricing/tiers.ts
 * defines: its prices are AUD including GST, and nothing converts them. A region changes two things: the Free
 * card, shown where FREE_TIER_ENABLED_<REGION> is "true"; and GST, shown included for AU and excluded (the same
 * AUD price less 10%) everywhere else, where the toggle starts on "ex GST".
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

const INC_GST_NOTE = "Prices include 10% GST for Australian customers.";
const EX_GST_NOTE = "GST of 10% applies to Australian customers at checkout.";
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

describe("each region's pricing page", () => {
  it.each(
    REGIONS,
  )("%s: tiers.ts's AUD prices (inc GST for AU only), the Free card only where its flag is on", async (region) => {
    const au = region === "au";
    for (const freeOn of [true, false]) {
      vi.stubEnv(`FREE_TIER_ENABLED_${region.toUpperCase()}`, freeOn ? "true" : "false");
      const html = await pricingHtml(region);
      expect(card(html, "free") !== null, `${region} Free card, flag ${freeOn}`).toBe(freeOn);
      expect(html).toContain(au ? INC_GST_NOTE : EX_GST_NOTE);
      for (const tier of PRICED) {
        const cents = tier.monthlyPriceCentsIncGst;
        expect(card(html, tier.key), `${region} ${tier.key}`).toContain(
          `${formatAud(au ? cents : priceExGst(cents))}</span>`,
        );
      }
      expect(card(html, "enterprise")).toContain("Custom");
      // No other currency anywhere: tiers.ts defines AUD only.
      expect(html).not.toMatch(/US\$|NZ\$|C\$|£|€|USD|NZD|GBP|EUR|CAD/);
    }
  });

  it("with no region on the request (no middleware ran), the AU page", async () => {
    const html = await pricingHtml(null);
    expect(html).toContain(INC_GST_NOTE);
  });
});
