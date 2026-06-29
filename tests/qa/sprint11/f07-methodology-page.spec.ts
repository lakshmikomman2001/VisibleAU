import { test, expect } from '@playwright/test';

test.describe('F07: Public methodology page', () => {
  test('F07-01: /methodology renders method cards', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/citab|method|visibility/i);
  });

  test('F07-02: no "AutoGEO" or "ICLR 2026" on page', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    const text = await page.locator('body').textContent();
    expect(text).not.toMatch(/AutoGEO/i);
    expect(text).not.toMatch(/ICLR 2026/i);
  });

  test('F07-03: no hardcoded "47" in method count', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    const text = await page.locator('body').textContent();
    expect(text).not.toMatch(/47 citab|47 method|all 47|Show all 47/i);
  });

  test('F07-04: has honest framing clause (correlations)', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/correlation|not guaranteed/i);
  });

  test('F07-05: Research Citations section exists', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Research Citations/i);
  });

  test('F07-06: Princeton GEO citation present', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Princeton|KDD 2024|GEO/i);
  });
});
