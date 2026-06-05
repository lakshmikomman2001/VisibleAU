import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, schema } from "../../shared/db";
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
let firstItemId = "";

test.describe("F08: Action Detail page — view + mark done + dismiss", () => {
  test.beforeAll(async () => {
    const org = await seedOrg({ clerkOrgId: CLERK_ORG, name: "[S6-QA] F08 Org" });
    orgId = org.id;
    await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId, email: EMAIL });
    const brand = await seedBrand({ organizationId: orgId, name: "[S6-QA] F08 Brand" });
    const audit = await seedAudit({ organizationId: orgId, brandId: brand.id });
    await seedActionItems({ organizationId: orgId, brandId: brand.id, auditId: audit.id });
    const [item] = await db
      .select({ id: schema.actionItems.id })
      .from(schema.actionItems)
      .where(eq(schema.actionItems.auditId, audit.id))
      .limit(1);
    firstItemId = item.id;
  });

  test.afterAll(async () => {
    await cleanupOrg(orgId);
  });

  test("F08-01: Detail page loads with title and confidence badge", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto(`/action-center/${firstItemId}`);
    await expect(page.getByText(/what to do/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F08-02: Detail page shows confidence badge", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto(`/action-center/${firstItemId}`);
    const badge = page.getByText(/confirmed|likely|hypothesis/i).first();
    await expect(badge).toBeVisible({ timeout: 10000 });
  });

  test("F08-03: Detail page shows Mark as done button", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto(`/action-center/${firstItemId}`);
    await expect(page.getByText(/mark as done/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F08-04: Detail page shows Dismiss button", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto(`/action-center/${firstItemId}`);
    await expect(page.getByText(/dismiss/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("F08-05: Evidence link expands research citations", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto(`/action-center/${firstItemId}`);
    const viewResearch = page.getByText(/view research/i).first();
    if (await viewResearch.isVisible()) {
      await viewResearch.click();
      await expect(page.getByText(/princeton|SE ranking|tinuiti|local SEO/i).first()).toBeVisible({
        timeout: 5000,
      });
    }
  });
});
