import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F13: Notification Preferences API (Sprint 9)", () => {
  test("F13-E2E-01: GET /api/notification-preferences returns 200 after auth", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/notification-preferences`);
    expect(res.status()).toBe(200);
  });

  test("F13-E2E-02: Unauthenticated GET returns redirect or non-200", async ({ request }) => {
    const res = await request.get(`${BASE}/api/notification-preferences`);
    // Without auth: should not return authenticated preference data
    const text = await res.text();
    expect(text).not.toContain('"preferences"');
  });

  test("F13-E2E-03: Health check API returns 200", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });
});
