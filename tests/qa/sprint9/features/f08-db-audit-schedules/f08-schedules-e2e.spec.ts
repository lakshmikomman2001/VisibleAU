import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F08: Audit Schedules (Sprint 9)", () => {
  test("F08-E2E-01: Brands list page loads at /portfolio", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/portfolio");
    await expect(page.locator("body")).toBeVisible();
    // Page should show brands or an empty state — not an error
    await expect(page.locator("body")).not.toHaveText(/500|Internal Server Error/);
  });

  test("F08-E2E-02: Health check API returns 200", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });
});
