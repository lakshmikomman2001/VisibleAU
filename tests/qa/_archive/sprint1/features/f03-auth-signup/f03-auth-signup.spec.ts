import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { organizations, users } from "../../../../../db/schema";
import { cleanupOrg } from "../../shared/cleanup";
import { db } from "../../shared/db";
import { seedOrg, seedUser } from "../../shared/seed";

const ORG_CLERK_ID = process.env.E2E_TEST_ORG_1_CLERK_ID ?? "";
const USER_CLERK_ID = process.env.E2E_TEST_USER_1_CLERK_ID ?? "";

let orgDbId = "";

test.describe("F03: Sign-up flow", () => {
  test.beforeAll(async () => {
    // Seed app tables so getCurrentUser() works after sign-in
    if (ORG_CLERK_ID && USER_CLERK_ID) {
      const org = await seedOrg({
        clerkOrgId: ORG_CLERK_ID,
        name: "[S1-QA] F03 Signup Org",
        region: "au",
        tier: "free",
      });
      orgDbId = org.id;
      await seedUser({
        clerkUserId: USER_CLERK_ID,
        organizationId: orgDbId,
        email: process.env.E2E_TEST_USER_1_EMAIL!,
      });
    }
  });

  test.afterAll(async () => {
    if (orgDbId) await cleanupOrg(orgDbId);
  });

  test("F03-01: Sign-up page loads at /sign-up", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page).not.toHaveURL(/500|error/);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  });

  test("F03-02: Signing in as test user lands on /dashboard", async ({ page }) => {
    test.skip(!USER_CLERK_ID, "E2E_TEST_USER_1_CLERK_ID not set — cannot sign in");
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await expect(page).toHaveURL(/dashboard/);
  });

  test("F03-03: DB has organizations row for test org", async () => {
    test.skip(!ORG_CLERK_ID, "E2E_TEST_ORG_1_CLERK_ID not set");
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, ORG_CLERK_ID));
    expect(org, "organizations row must exist").toBeDefined();
    expect(org.name).toBeTruthy();
    expect(["au", "nz", "uk", "us", "ca", "eu"]).toContain(org.region);
    expect(["free", "starter", "growth", "agency", "agency_pro"]).toContain(org.tier);
  });

  test("F03-04: DB has users row linked to test org", async () => {
    test.skip(!USER_CLERK_ID, "E2E_TEST_USER_1_CLERK_ID not set");
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, ORG_CLERK_ID));
    expect(org).toBeDefined();
    const [user] = await db.select().from(users).where(eq(users.clerkUserId, USER_CLERK_ID));
    expect(user, "users row must exist").toBeDefined();
    expect(user.organizationId).toBe(org.id);
    expect(user.email).toBeTruthy();
  });

  test("F03-05: Signed-in user on /dashboard sees sidebar", async ({ page }) => {
    test.skip(!USER_CLERK_ID, "E2E_TEST_USER_1_CLERK_ID not set — cannot sign in");
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await expect(page.locator("nav, aside, [data-sidebar]").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("F03-06: Unauthenticated GET /dashboard redirects to /sign-in", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
    await ctx.close();
  });
});
