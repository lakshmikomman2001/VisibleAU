import { test, expect } from '@playwright/test';

test.describe('F05: Marketing landing page', () => {
  test('F05-01: / renders hero with brand name', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/VisibleAU|visibility|AI/i);
  });

  test('F05-02: / has a sign-up CTA', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const cta = page.locator('a[href*="sign-up"], a[href*="sample-audit"]').first();
    await expect(cta).toBeVisible({ timeout: 10_000 });
  });

  test('F05-03: / has pricing teaser section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/pricing|plan|month/i);
  });

  test('F05-04: / has trust badges', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/SSL|privacy|encrypted/i);
  });
});
