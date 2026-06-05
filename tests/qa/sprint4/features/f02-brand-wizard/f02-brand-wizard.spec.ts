import { expect, test } from "@playwright/test";

test.describe("F02: Brand Wizard (Sprint 4)", () => {
  test("F02-01: Wizard page loads at /brands/wizard", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/brands/wizard");
    await expect(page.getByText(/step 1 of 4/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F02-02: Wizard shows step indicator (4 steps)", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/brands/wizard");
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible({ timeout: 10000 });
  });

  test("F02-03: Wizard step 1 has name and domain fields", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/brands/wizard");
    await expect(page.locator('#wiz-name, input[placeholder*="Bondi"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('#wiz-domain, input[placeholder*=".com.au"]')).toBeVisible();
  });
});
