import { test, expect } from '@playwright/test';

test.describe('F06: Public boilerplate pages', () => {
  test('F06-01: /about renders', async ({ page }) => {
    const res = await page.goto('/about');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).toContainText(/about|VisibleAU/i);
  });

  test('F06-02: /privacy renders', async ({ page }) => {
    const res = await page.goto('/privacy');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).toContainText(/privacy|data|personal/i);
  });

  test('F06-03: /terms renders', async ({ page }) => {
    const res = await page.goto('/terms');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).toContainText(/terms|service|agreement/i);
  });

  test('F06-04: /pricing renders with tiers', async ({ page }) => {
    const res = await page.goto('/pricing');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).toContainText(/free|starter|growth/i);
  });
});
