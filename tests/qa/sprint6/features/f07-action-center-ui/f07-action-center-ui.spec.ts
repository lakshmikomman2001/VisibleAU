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

test.describe("F07: Action Center — list page UI", () => {
  test.beforeAll(async () => {
    const org = await seedOrg({ clerkOrgId: CLERK_ORG, name: "[S6-QA] F07 Org" });
    orgId = org.id;
    await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId, email: EMAIL });
    const brand = await seedBrand({ organizationId: orgId, name: "[S6-QA] F07 Brand" });
    const audit = await seedAudit({ organizationId: orgId, brandId: brand.id });
    await seedActionItems({ organizationId: orgId, brandId: brand.id, auditId: audit.id });
  });

  test.afterAll(async () => {
    await cleanupOrg(orgId);
  });

  test("F07-01: Action Center page loads and shows heading", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await expect(page.getByText(/action center/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F07-02: Shows recommendation count in header", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await expect(page.getByText(/open recommendation/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F07-03: Shows dimension group headers (Frequency, Accuracy, etc.)", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await expect(page.getByText("Frequency").first()).toBeVisible({ timeout: 10000 });
  });

  test("F07-04: Shows recommendation card titles", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await expect(
      page.getByText(/Wikipedia entry/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("F07-05: Confidence badges render (Confirmed/Likely/Hypothesis)", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await expect(page.getByText("Confirmed").first()).toBeVisible({ timeout: 10000 });
  });

  test("F07-06: Recommendation card is clickable and navigates to detail", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await page.getByText(/Wikipedia entry/i).first().click();
    await page.waitForURL("**/action-center/**", { timeout: 10000 });
    await expect(page.getByText(/what to do/i).first()).toBeVisible({ timeout: 10000 });
  });
});
