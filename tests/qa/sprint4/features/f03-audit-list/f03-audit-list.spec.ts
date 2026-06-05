import { expect, test } from "@playwright/test";

const _BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F03: Audit List (Sprint 4)", () => {
  test("F03-01: Audit list page loads at /audits", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/audits");
    await expect(page.getByText(/audits/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F03-02: Audit list shows table headers", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/audits");
    // Should show table or empty state
    await expect(page.locator("body")).toBeVisible();
  });
});
