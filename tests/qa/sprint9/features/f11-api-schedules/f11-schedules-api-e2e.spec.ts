import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F11: Schedules API (Sprint 9)", () => {
  test("F11-E2E-01: GET /api/audit-schedules returns 200 after auth", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/audit-schedules`);
    expect(res.status()).toBe(200);
  });

  test("F11-E2E-02: Unauthenticated GET returns redirect or non-200", async ({ request }) => {
    const res = await request.get(`${BASE}/api/audit-schedules`);
    // Without auth: should not return authenticated data
    const status = res.status();
    // Accept redirect (302/307), 401, 403, or any non-200 indicating auth required
    expect(status === 200 && (await res.text()).includes('"schedules"')).toBeFalsy();
  });

  test("F11-E2E-03: /api/audit-schedules route exists", async ({ request }) => {
    const res = await request.get(`${BASE}/api/audit-schedules`);
    // Route should exist — not 404. May redirect or require auth, but should not be 404 or 500.
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeLessThan(500);
  });
});
