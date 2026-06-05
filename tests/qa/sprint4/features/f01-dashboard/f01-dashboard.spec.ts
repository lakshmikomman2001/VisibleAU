import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F01: Dashboard (Sprint 4)", () => {
  test("F01-01: Dashboard page loads for signed-in user", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("F01-02: Dashboard shows KPI cards", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await expect(page.getByText(/brands tracked/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F01-03: Unauthenticated /dashboard redirects to sign-in", async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/dashboard");
    await expect(p).toHaveURL(/sign-in/);
    await ctx.close();
  });

  test("F01-04: Health check API alive", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });
});
