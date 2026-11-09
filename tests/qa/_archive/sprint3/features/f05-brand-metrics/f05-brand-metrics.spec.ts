import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F05: Brand Metrics API (Sprint 3)", () => {
  test("F05-01: GET /api/brands/[invalid]/metrics returns 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/brands/not-a-uuid/metrics`);
    expect(res.status()).toBe(404);
  });

  test("F05-02: GET /api/brands/[nonexistent]/metrics returns 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(
      `${BASE}/api/brands/00000000-0000-4000-8000-000000000000/metrics`,
    );
    expect(res.status()).toBe(404);
  });

  test("F05-03: Health check confirms API running", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });
});
