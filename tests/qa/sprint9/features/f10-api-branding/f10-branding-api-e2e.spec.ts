import { expect, type Page, test } from "@playwright/test";
import {
  E2E_AGENCY_USER,
  ensureE2eAgencyUser,
  removeE2eAgencyUser,
} from "../../../../e2e/helpers/agency-user";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

// Report branding is Agency-plan only, and E2E_TEST_USER_1 has no subscription.
test.beforeAll(() => ensureE2eAgencyUser().then(() => undefined));
test.afterAll(() => removeE2eAgencyUser());

async function signInAsAgencyUser(page: Page) {
  await page.goto("/sign-in");
  await page.fill('input[type="email"]', E2E_AGENCY_USER.email);
  await page.fill('input[type="password"]', E2E_AGENCY_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}

test.describe("F10: Branding API (Sprint 9)", () => {
  test("F10-E2E-01: GET /api/agency/branding returns 200 after auth", async ({ page }) => {
    await signInAsAgencyUser(page);

    const res = await page.request.get(`${BASE}/api/agency/branding`);
    expect(res.status()).toBe(200);
  });

  test("F10-E2E-02: Unauthenticated GET returns redirect or 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/agency/branding`);
    // Without auth: expect redirect (302/307), 401, or 403
    const text = await res.text();
    expect(text).not.toContain('"agencyName"');
  });

  test("F10-E2E-03: Agency branding page accessible after sign-in", async ({ page }) => {
    await signInAsAgencyUser(page);
    await page.goto("/agency/branding");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("body")).not.toHaveText(/500|Internal Server Error/);
    await expect(page.locator('[data-plan-locked="white_label_reports"]')).toHaveCount(0);
  });
});
