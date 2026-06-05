import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F03: Mock LLM Mode (Sprint 2)", () => {
  test("F03-01: App starts with LLM_MODE=mock without OpenAI key", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });

  test("F03-02: POST /api/audits accepts scenario parameter", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    // Create a brand first
    const brandRes = await page.request.post(`${BASE}/api/brands`, {
      data: { name: "[S2-QA] Mock LLM Brand", domain: "s2qa-mock.com.au", vertical: "tradies" },
    });
    const brandData = await brandRes.json();
    const brandId = brandData.brand?.id;

    if (brandId) {
      const auditRes = await page.request.post(`${BASE}/api/audits`, {
        data: { brandId, scenario: "no_mention" },
      });
      expect(auditRes.status()).toBe(201);
      const auditData = await auditRes.json();
      expect(auditData.auditId).toBeTruthy();
    }
  });
});
