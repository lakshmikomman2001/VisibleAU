/**
 * tests/e2e/06-region-and-pricing.spec.ts
 *
 * Frontend E2E: Region detection + feature flag rendering
 *
 * Sprint 1 §11 acceptance criteria:
 *   ✓ / has x-visibleau-region: au in its response headers
 *   ✓ FREE_TIER_ENABLED_AU=true → Free card shown on /pricing
 *   (the region routes have no pages: their tests were removed on 10 Nov, S10)
 *
 * These tests use Playwright's request API to inspect response headers
 * and the browser to verify rendered pricing page content.
 *
 * No test data created — no teardown needed.
 * These are stateless tests against public pages.
 */

import { expect, test } from "@playwright/test";

// Public page tests — no auth required
// The region routes (/au/, /nz/, /uk/, /us/, /ca/, /eu/, /au/pricing, /uk/pricing) have no pages (app/
// has (auth) and (marketing)/pricing only), so their tests were removed on 10 Nov (Playwright-run
// follow-ups, part 2, S10). What's left is the real pricing page and the header the middleware sets.
test.describe("Region detection (Sprint 1 §11)", () => {
  test("root path / defaults to au region", async ({ request }) => {
    const res = await request.get("/");
    const regionHeader = res.headers()["x-visibleau-region"];
    // Sprint 1 §8: detectRegion defaults to 'au' when no prefix and no geo country
    expect(regionHeader).toBe("au");
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
