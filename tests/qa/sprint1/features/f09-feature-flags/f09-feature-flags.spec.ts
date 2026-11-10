import { expect, test } from "@playwright/test";
import { GEO_COUNTRY_HEADER } from "@/lib/region/header";

test.describe("F09: Feature flags — free tier visibility", () => {
  // P4 fix: Sprint 1 spec §4 defines app/(marketing)/pricing/page.tsx → route is /pricing.
  // There are NO /au/ or /uk/ route groups in Sprint 1 — only middleware detects the region.
  // The feature flag (isFreeTierEnabled) gets the region from the request header the middleware sets
  // (lib/region/header.ts REGION_HEADER), from Vercel's country header (GEO_COUNTRY_HEADER) or the default, AU.

  test("F09-01: /pricing shows Free tier card when FREE_TIER_ENABLED_AU=true", async ({ page }) => {
    // P4 fix: use /pricing (not /au/pricing — that route does not exist in Sprint 1).
    // No country header: the AU page.
    await page.goto("/pricing");
    await expect(page).not.toHaveURL(/500/);
    await expect(page.getByText(/free/i).first()).toBeVisible();
  });

  // F09-02 ("/uk/pricing hides the Free tier") and F09-03 ("/au/ sets x-...-region") were removed on 10 Nov
  // (Playwright-run follow-ups, part 5): the region routes have no pages, so F09-02 passed on /uk/pricing's 404
  // and F09-03 tested a route that doesn't exist. Region pricing reaches /pricing since part 8, so F09-02 is
  // back, for a UK visitor on /pricing.
  test("F09-02: a UK visitor's /pricing shows the Free card only when FREE_TIER_ENABLED_UK=true", async ({
    request,
  }) => {
    const res = await request.get("/pricing", { headers: { [GEO_COUNTRY_HEADER]: "GB" } });
    expect(res.status()).toBe(200);
    const freeOn = process.env.FREE_TIER_ENABLED_UK === "true";
    expect((await res.text()).includes('data-plan-card="free"')).toBe(freeOn);
  });

  test("F09-04: /pricing page loads successfully (200) for AU region", async ({ request }) => {
    // P4 fix: test the correct /pricing route (not /au/pricing).
    const res = await request.get("/pricing");
    expect(res.status()).toBe(200);
  });
});
