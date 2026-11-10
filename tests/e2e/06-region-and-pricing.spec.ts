/**
 * tests/e2e/06-region-and-pricing.spec.ts
 *
 * Frontend E2E: Region detection + feature flag rendering
 *
 * Sprint 1 §11 acceptance criteria:
 *   ✓ the visitor's region reaches /pricing (Playwright-run follow-ups, 10 Nov, part 8: the middleware set
 *     it on the response, so the page never saw it and every visitor got AU's; it's on the request now)
 *   ✓ FREE_TIER_ENABLED_<REGION>=true → Free card shown on /pricing
 *   (the region routes have no pages: their tests were removed on 10 Nov, S10)
 *
 * These tests use Playwright's request API, sending the country header Vercel sets
 * (lib/region/header.ts GEO_COUNTRY_HEADER), and the browser to verify rendered pricing page content.
 *
 * No test data created — no teardown needed.
 * These are stateless tests against public pages.
 */

import { expect, test } from "@playwright/test";
import { GEO_COUNTRY_HEADER, REGION_HEADER } from "@/lib/region/header";

// The pricing page's GST note (components/domain/pricing/pricing-table-client.tsx): GST included for AU.
const INC_GST_NOTE = "Prices include 10% GST for Australian customers.";
const EX_GST_NOTE = "GST of 10% applies to Australian customers at checkout.";
const VISITORS: Array<{ country: string | null; region: string }> = [
  { country: null, region: "au" },
  { country: "AU", region: "au" },
  { country: "NZ", region: "nz" },
  { country: "GB", region: "uk" },
  { country: "US", region: "us" },
  { country: "CA", region: "ca" },
  { country: "DE", region: "eu" },
];

// Public page tests — no auth required
// The region routes (/au/, /nz/, /uk/, /us/, /ca/, /eu/, /au/pricing, /uk/pricing) have no pages (app/
// has (auth) and (marketing)/pricing only), so their tests were removed on 10 Nov (Playwright-run
// follow-ups, part 2, S10). What's left is the real pricing page, and the region the middleware gives it.
test.describe("Region detection (Sprint 1 §11)", () => {
  for (const { country, region } of VISITORS) {
    test(`a visitor from ${country ?? "an unknown country"} gets the ${region} pricing page`, async ({
      request,
    }) => {
      const res = await request.get("/pricing", {
        headers: country ? { [GEO_COUNTRY_HEADER]: country } : {},
      });
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain(region === "au" ? INC_GST_NOTE : EX_GST_NOTE);
      // The server reads the same .env.test.local as this process (tests/e2e/helpers/e2e-config.ts).
      const freeOn = process.env[`FREE_TIER_ENABLED_${region.toUpperCase()}`] === "true";
      expect(html.includes('data-plan-card="free"'), `Free card, flag ${freeOn}`).toBe(freeOn);
      // On the request only: the response doesn't carry it.
      expect(res.headers()[REGION_HEADER]).toBeUndefined();
    });
  }

  test("a visitor can't choose a region by sending the header themselves", async ({ request }) => {
    const res = await request.get("/pricing", {
      headers: { [GEO_COUNTRY_HEADER]: "AU", [REGION_HEADER]: "uk" },
    });
    expect(await res.text()).toContain(INC_GST_NOTE);
  });
});

test.describe("Pricing page feature flags (Sprint 1 §11)", () => {
  test("/pricing shows the Free tier (AU, the default region: FREE_TIER_ENABLED_AU=true)", async ({
    page,
  }) => {
    await page.goto("/pricing");

    // Free tier card should be present for AU users
    // Sprint 1 §9 step 7: isFreeTierEnabled('au') = true → Free card rendered
    await expect(
      page
        .getByText(/free/i)
        .filter({ hasText: /plan|tier|A\$0|\$0/i })
        .or(page.getByText("A$0"))
        .or(page.getByText("$0"))
        .or(page.getByText(/free plan/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("paid tiers (Starter, Growth, Agency) are shown on pricing page", async ({ page }) => {
    await page.goto("/pricing");

    // Each plan's card heading (the comparison table names them again, so not any text).
    for (const plan of ["Starter", "Growth", "Agency"]) {
      await expect(page.getByRole("heading", { name: plan, exact: true }).first()).toBeVisible();
    }
  });

  test("pricing page is publicly accessible (no auth required)", async ({ browser }) => {
    const ctx = await browser.newContext(); // fresh context, no session
    const page = await ctx.newPage();

    await page.goto("/pricing");

    // Should not redirect to sign-in
    await expect(page).not.toHaveURL(/sign-in/);
    // Pricing content visible
    await expect(page.getByRole("heading", { name: "Pricing", level: 1 })).toBeVisible();

    await ctx.close();
  });
});
