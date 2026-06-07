/**
 * tests/e2e/06-region-and-pricing.spec.ts
 *
 * Frontend E2E: Region detection + feature flag rendering
 *
 * Sprint 1 §11 acceptance criteria:
 *   ✓ /au/* routes have x-visibleau-region: au in response headers
 *   ✓ /uk/* routes have x-visibleau-region: uk in response headers
 *   ✓ FREE_TIER_ENABLED_UK=false → Free card hidden on /uk/pricing
 *   ✓ FREE_TIER_ENABLED_AU=true  → Free card shown on /au/pricing
 *
 * These tests use Playwright's request API to inspect response headers
 * and the browser to verify rendered pricing page content.
 *
 * No test data created — no teardown needed.
 * These are stateless tests against public pages.
 */

import { test, expect } from '@playwright/test';

// Public page tests — no auth required
test.describe('Region detection (Sprint 1 §11)', () => {
  const regionCases: Array<{ prefix: string; expected: string }> = [
    { prefix: 'au',  expected: 'au' },
    { prefix: 'nz',  expected: 'nz' },
    { prefix: 'uk',  expected: 'uk' },
    { prefix: 'us',  expected: 'us' },
    { prefix: 'ca',  expected: 'ca' },
    { prefix: 'eu',  expected: 'eu' },
  ];

  for (const { prefix, expected } of regionCases) {
    test(`/${prefix}/* routes return x-visibleau-region: ${expected}`, async ({ request }) => {
      // Use the API request context (not a browser page) to inspect headers
      const res = await request.get(`/${prefix}/`);
      const regionHeader = res.headers()['x-visibleau-region'];
      expect(regionHeader).toBe(expected);
    });
  }

  test('root path / defaults to au region', async ({ request }) => {
    const res = await request.get('/');
    const regionHeader = res.headers()['x-visibleau-region'];
    // Sprint 1 §8: detectRegion defaults to 'au' when no prefix and no geo country
    expect(regionHeader).toBe('au');
  });

  test('nested paths carry the region prefix correctly', async ({ request }) => {
    const res = await request.get('/au/pricing');
    const regionHeader = res.headers()['x-visibleau-region'];
    expect(regionHeader).toBe('au');
  });
});

test.describe('Pricing page feature flags (Sprint 1 §11)', () => {
  test('AU pricing page shows Free tier (FREE_TIER_ENABLED_AU=true)', async ({ page }) => {
    await page.goto('/au/pricing');

    // Free tier card should be present for AU users
    // Sprint 1 §9 step 7: isFreeTierEnabled('au') = true → Free card rendered
    await expect(
      page.getByText(/free/i).filter({ hasText: /plan|tier|A\$0|\$0/i })
        .or(page.getByText('A$0'))
        .or(page.getByText('$0'))
        .or(page.getByText(/free plan/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('UK pricing page hides Free tier (FREE_TIER_ENABLED_UK=false)', async ({ page }) => {
    await page.goto('/uk/pricing');

    // Free tier card must NOT be present for UK users
    // Sprint 1 §9 step 7: isFreeTierEnabled('uk') = false → Free card not rendered
    // The "Free" text may still appear in other contexts (e.g. "Free trial")
    // so we check specifically for the Free pricing card
    const freePricingCard = page.getByText(/A\$0|free plan/i)
      .or(page.getByText('Free').filter({ hasText: /\$0|forever|free tier/i }));

    await expect(freePricingCard).toBeHidden({ timeout: 10_000 });
  });

  test('paid tiers (Starter, Growth, Agency) are shown on pricing page', async ({ page }) => {
    await page.goto('/au/pricing');

    // Sprint 1 prototype: 4 paid tiers + Free (AU) = 5 total visible cards
    // Verify at least the main paid tiers render
    await expect(page.getByText(/starter/i)).toBeVisible();
    await expect(page.getByText(/growth/i)).toBeVisible();
    await expect(page.getByText(/agency/i)).toBeVisible();
  });

  test('pricing page is publicly accessible (no auth required)', async ({ browser }) => {
    const ctx = await browser.newContext(); // fresh context, no session
    const page = await ctx.newPage();

    await page.goto('/au/pricing');

    // Should not redirect to sign-in
    await expect(page).not.toHaveURL(/sign-in/);
    // Pricing content visible
    await expect(page.getByText(/starter/i).or(page.getByText(/pricing/i))).toBeVisible();

    await ctx.close();
  });
});
