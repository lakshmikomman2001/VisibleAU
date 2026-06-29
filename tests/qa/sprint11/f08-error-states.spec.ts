import { test, expect } from '@playwright/test';

test.describe('F08: Error and 404 states', () => {
  test('F08-01: non-existent public route shows 404 page', async ({ page }) => {
    await page.goto('/methodology/this-page-does-not-exist');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('404');
  });

  test('F08-02: 404 page has back link', async ({ page }) => {
    await page.goto('/about/nonexistent-route');
    await page.waitForLoadState('networkidle');
    const backLink = page.locator('a').filter({ hasText: /back|home/i }).first();
    await expect(backLink).toBeVisible({ timeout: 10_000 });
  });

  test('F08-03: non-public unknown route redirects to sign-in', async ({ page }) => {
    await page.goto('/some-unknown-protected-route');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('sign-in');
  });

  test('F08-04: /sample-audit page renders form', async ({ page }) => {
    await page.goto('/sample-audit');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/audit|domain|visibility/i);
  });
});
