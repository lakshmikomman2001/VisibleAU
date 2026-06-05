import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F04: Full Audit Payload API (Sprint 3)", () => {
  test("F04-01: GET /api/audits/[invalid]/full returns 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/audits/not-a-uuid/full`);
    expect(res.status()).toBe(404);
  });

  test("F04-02: GET /api/audits/[nonexistent]/full returns 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(
      `${BASE}/api/audits/00000000-0000-4000-8000-000000000000/full`,
    );
    expect(res.status()).toBe(404);
  });
});
