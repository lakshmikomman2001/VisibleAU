import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F06: Agency Branding (Sprint 9)", () => {
  test("F06-E2E-01: Agency branding page loads", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/agency/branding");
    await expect(page.getByText(/branding/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F06-E2E-02: Form fields visible (Agency Name, color pickers)", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/agency/branding");
    await expect(
      page.locator('input[name="agencyName"], input[placeholder*="agency" i], input[id*="name" i]').first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('input[type="color"], [data-testid*="color"], input[name*="color" i]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("F06-E2E-03: Save button exists", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/agency/branding");
    await expect(
      page.locator('button:has-text("Save"), button[type="submit"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("F06-E2E-04: Preview section exists", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/agency/branding");
    await expect(
      page.getByText(/preview/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
