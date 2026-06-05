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

test.describe("F09: Tier Gate — Free tier blur + upgrade CTA", () => {
  test.beforeAll(async () => {
    const org = await seedOrg({
      clerkOrgId: CLERK_ORG,
      name: "[S6-QA] F09 Org",
      tier: "free",
    });
    orgId = org.id;
    await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId, email: EMAIL });
    const brand = await seedBrand({ organizationId: orgId, name: "[S6-QA] F09 Brand" });
    const audit = await seedAudit({ organizationId: orgId, brandId: brand.id });
    await seedActionItems({ organizationId: orgId, brandId: brand.id, auditId: audit.id });
  });

  test.afterAll(async () => {
    await cleanupOrg(orgId);
  });

  test("F09-01: Free tier user sees Action Center page with recommendations", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await expect(page.getByText(/action center/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/open recommendation/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("F09-02: Free tier shows Upgrade CTA link", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|brands|action-center|verticals|audits)/, { timeout: 30000 });
    await page.goto("/action-center");
    await expect(
      page.getByText(/upgrade to starter/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("F09-03: Free tier still shows recommendation titles (not fully hidden)", async ({
    page,
  }) => {
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
});
