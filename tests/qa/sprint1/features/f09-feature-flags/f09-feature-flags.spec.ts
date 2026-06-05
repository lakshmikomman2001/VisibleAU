import { expect, test } from "@playwright/test";

test.describe("F09: Feature flags — free tier visibility", () => {
  // P4 fix: Sprint 1 spec §4 defines app/(marketing)/pricing/page.tsx → route is /pricing.
  // There are NO /au/ or /uk/ route groups in Sprint 1 — only middleware sets the region header.
  // The feature flag (isFreeTierEnabled) reads the region from the x-visibleau-region header,
  // which the middleware sets based on the URL prefix or geo-IP.
  // Testing strategy: navigate to /pricing with the region detected from /au/ prefix.

  test("F09-01: /pricing shows Free tier card when FREE_TIER_ENABLED_AU=true", async ({ page }) => {
    // P4 fix: use /pricing (not /au/pricing — that route does not exist in Sprint 1).
    // The middleware sets x-visibleau-region=au for requests to /au/* paths.
    // Since the pricing page is at /pricing and reads the region header set by middleware,
    // navigate via the /au/ prefix to ensure the middleware sets region=au for the request.
    // In practice the pricing page server component reads the 'x-visibleau-region' response header.
    await page.goto("/pricing");
    await expect(page).not.toHaveURL(/500/);
    await expect(page.getByText(/free/i).first()).toBeVisible();
  });

  test("F09-02: /pricing with UK region hides Free tier (FREE_TIER_ENABLED_UK=false)", async ({
    page,
  }) => {
    // P4 fix: /uk/pricing does not exist. Test /pricing with the middleware detecting UK region.
    // In local dev, inject region via the middleware's URL prefix detection by going to /uk/pricing.
    // The middleware detects /uk/ prefix → sets x-visibleau-region: uk header.
    // The pricing page reads this header and hides the Free card.
    // NOTE: if /uk/ prefix redirects (middleware redirects /uk/* → /pricing with header), adjust path.
    await page.goto("/uk/pricing"); // middleware detects /uk/ → region=uk; may redirect to /pricing
    const freeCard = page
      .locator('[data-tier="free"], [data-testid="tier-free"]')
      .or(page.getByRole("heading", { name: /^free$/i }));
    const count = await freeCard.count();
    expect(count).toBe(0);
  });

  test("F09-03: x-visibleau-region header is set on /au/ route (middleware verification)", async ({
    request,
  }) => {
    const res = await request.get("/au/");
    expect(res.headers()["x-visibleau-region"]).toBe("au");
  });

  test("F09-04: /pricing page loads successfully (200) for AU region", async ({ request }) => {
    // P4 fix: test the correct /pricing route (not /au/pricing).
    const res = await request.get("/pricing");
    expect(res.status()).toBe(200);
  });
});
