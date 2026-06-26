import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F09: Notification Preferences (Sprint 9)", () => {
  test("F09-E2E-01: Notification settings page loads", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/settings/notifications");
    await expect(page.getByText(/notification/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F09-E2E-02: Toggle switches are visible", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/settings/notifications");
    await expect(
      page.locator('input[type="checkbox"], [role="switch"], button[role="switch"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("F09-E2E-03: Save button exists", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/settings/notifications");
    await expect(
      page.locator('button:has-text("Save"), button[type="submit"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("F09-E2E-04: Email input field exists", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/settings/notifications");
    await expect(
      page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
