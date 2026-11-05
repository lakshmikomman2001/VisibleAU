import { expect, type Page, test } from "@playwright/test";
import {
  E2E_AGENCY_USER,
  ensureE2eAgencyUser,
  removeE2eAgencyUser,
} from "../../../../e2e/helpers/agency-user";

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

test.describe("F06: Agency Branding (Sprint 9)", () => {
  test("F06-E2E-01: Agency branding page loads, not locked", async ({ page }) => {
    await signInAsAgencyUser(page);
    await page.goto("/agency/branding");
    await page.waitForURL("**/settings/report-branding**", { timeout: 15000 });
    await expect(page.getByText(/branding/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-plan-locked="white_label_reports"]')).toHaveCount(0);
  });

  test("F06-E2E-02: Form fields visible (Agency Name, color pickers)", async ({ page }) => {
    await signInAsAgencyUser(page);
    await page.goto("/agency/branding");
    await expect(page.getByLabel("Agency name")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="color"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("F06-E2E-03: Save button exists", async ({ page }) => {
    await signInAsAgencyUser(page);
    await page.goto("/agency/branding");
    await expect(
      page.locator('button:has-text("Save"), button[type="submit"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("F06-E2E-04: Preview section exists", async ({ page }) => {
    await signInAsAgencyUser(page);
    await page.goto("/agency/branding");
    await expect(page.getByText(/preview/i).first()).toBeVisible({ timeout: 10000 });
  });
});
