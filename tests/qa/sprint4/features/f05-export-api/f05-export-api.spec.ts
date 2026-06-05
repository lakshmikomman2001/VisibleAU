import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F05: Export API (Sprint 4)", () => {
  test("F05-01: Export endpoint returns 404 for non-existent audit", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(
      `${BASE}/api/audits/00000000-0000-4000-8000-000000000000/export?format=json`,
    );
    expect(res.status()).toBe(404);
  });

  test("F05-02: Export endpoint requires auth", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/audits/00000000-0000-4000-8000-000000000000/export?format=csv`,
    );
    // Redirects to sign-in or returns 401 — either way, no CSV data
    const text = await res.text();
    expect(text).not.toContain("audit_number,brand_name");
  });

  test("F05-03: Health check confirms Sprint 4 API running", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });
});
