import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

/** Reusable sign-in helper — mirrors Sprint 4 pattern. */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.fill(
    'input[type="email"]',
    process.env.E2E_TEST_USER_1_EMAIL!,
  );
  await page.fill(
    'input[type="password"]',
    process.env.E2E_TEST_USER_1_PASSWORD!,
  );
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}

test.describe("F08: Billing Page (Sprint 10)", () => {
  test("F08-E2E-01: Billing page loads at /settings/billing after sign-in", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");

    // The BillingView component renders an h1 with text "Billing"
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toHaveText(/billing/i);
  });

  test("F08-E2E-02: Billing page shows tier or plan info", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");

    // The page renders "Current plan" label and tier name, or a price string
    const body = page.locator("body");
    await expect(body).toContainText(/current plan|free|starter|pro|enterprise/i, {
      timeout: 10000,
    });
  });

  test("F08-E2E-03: Billing page shows current plan card", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/current plan/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("F08-E2E-04: Unauthenticated /settings/billing redirects to sign-in", async ({
    page,
  }) => {
    // Navigate directly without signing in — server should redirect to /sign-in
    await page.goto("/settings/billing");
    await page.waitForURL("**/sign-in**", { timeout: 15000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });
});
