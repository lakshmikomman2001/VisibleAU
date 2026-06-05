import { expect, test } from "@playwright/test";
import {
  cleanupOrg,
  seedActionItems,
  seedAudit,
  seedBrand,
  seedOrg,
  seedUser,
} from "../../shared/seed";

const EMAIL = process.env.E2E_TEST_USER_1_EMAIL!;
const PASSWORD = process.env.E2E_TEST_USER_1_PASSWORD!;
const CLERK_ORG = process.env.E2E_TEST_ORG_1_CLERK_ID!;
const CLERK_USER = process.env.E2E_TEST_USER_1_CLERK_ID!;
let orgId = "";

test.describe("F10: Sidebar navigation — Action Center + Vertical packs links", () => {
  test.beforeAll(async () => {
    const org = await seedOrg({ clerkOrgId: CLERK_ORG, name: "[S6-QA] F10 Org" });
    orgId = org.id;
    await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId, email: EMAIL });
    const brand = await seedBrand({ organizationId: orgId, name: "[S6-QA] F10 Brand" });
    const audit = await seedAudit({ organizationId: orgId, brandId: brand.id });
    await seedActionItems({ organizationId: orgId, brandId: brand.id, auditId: audit.id });
  });

  test.afterAll(async () => {
    await cleanupOrg(orgId);
  });

  test("F10-01: Sidebar shows Action Center link", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await expect(page.getByText("Action Center").first()).toBeVisible({ timeout: 10000 });
  });

  test("F10-02: Sidebar shows Vertical packs link", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await expect(page.getByText("Vertical packs").first()).toBeVisible({ timeout: 10000 });
  });

  test("F10-03: Clicking Action Center navigates to /action-center", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.getByText("Action Center").first().click();
    await page.waitForURL("**/action-center**", { timeout: 10000 });
    await expect(page.getByText(/open recommendation/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F10-04: Clicking Vertical packs navigates to /verticals", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.getByText("Vertical packs").first().click();
    await page.waitForURL("**/verticals**", { timeout: 10000 });
    await expect(page.getByText(/vertical packs/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F10-05: Breadcrumbs show 'Action Center' on /action-center page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await expect(page.locator("header").getByText("Action Center").first()).toBeVisible({
      timeout: 10000,
    });
  });
});
