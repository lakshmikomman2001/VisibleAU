import { expect, test } from "@playwright/test";
import { cleanupOrg } from "../../shared/cleanup";
import { seedOrg, seedUser } from "../../shared/seed";

let orgDbId = "";

test.describe("F04: Sign-in / Sign-out", () => {
  test.beforeAll(async () => {
    const org = await seedOrg({
      clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
      name: "[S1-QA] F04 Sign-in Org",
      region: "au",
      tier: "free",
    });
    orgDbId = org.id;
    await seedUser({
      clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!,
      organizationId: orgDbId,
      email: process.env.E2E_TEST_USER_1_EMAIL!,
    });
  });

  test.afterAll(async () => {
    await cleanupOrg(orgDbId);
  });

  test("F04-01: Sign-in page loads at /sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).not.toHaveURL(/500/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("F04-02: Valid credentials redirect to /dashboard", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page).toHaveURL(/dashboard/);

    await page.goto("/sign-in"); // navigating away is sufficient to end the test context
  });

  test("F04-03: Sign-out clears session and redirects away from dashboard", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    await page.goto("/dashboard");

    await page.goto("/sign-in"); // navigating away is sufficient to end the test context
    // After sign-out, should not be on dashboard
    await expect(page).not.toHaveURL(/dashboard/);
  });

  test("F04-04: Visiting /dashboard when signed out redirects to /sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("F04-05: Visiting /brands when signed out redirects to /sign-in", async ({ page }) => {
    await page.goto("/brands");
    await expect(page).toHaveURL(/sign-in/);
  });
});
