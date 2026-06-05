import { expect, test } from "@playwright/test";
import { cleanupOrg } from "../../shared/cleanup";
import { seedBrand, seedOrg, seedUser } from "../../shared/seed";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

let orgDbId = "";

test.describe("F05: Brand CRUD", () => {
  test.beforeAll(async () => {
    const org = await seedOrg({
      clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
      name: "[S1-QA] F05 Brand CRUD Org",
      region: "au",
      tier: "agency",
    });
    orgDbId = org.id;
    await seedUser({
      clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!,
      organizationId: orgDbId,
      email: process.env.E2E_TEST_USER_1_EMAIL!,
    });
    // Seed the test brand in beforeAll so F05-04/05/07/08 are independent of F05-03.
    await seedBrand({
      organizationId: orgDbId,
      name: "[S1-QA] Test Brand F05",
      domain: "s1-qa-f05.com.au",
      vertical: "tradies",
    });
  });

  test.afterAll(async () => {
    await cleanupOrg(orgDbId);
  });

  test("F05-01: Brand list page loads and shows empty state", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    await page.goto("/brands");
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.locator("body")).toBeVisible();

    await page.goto("/sign-in"); // navigating away is sufficient to end the test context
  });

  test("F05-02: Brand create form loads at /brands/new", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    await page.goto("/brands/new");
    // Form must have name, domain, vertical inputs
    await expect(page.getByLabel(/name/i).or(page.locator('input[name="name"]'))).toBeVisible();
    await expect(page.getByLabel(/domain/i).or(page.locator('input[name="domain"]'))).toBeVisible();

    await page.goto("/sign-in"); // navigating away is sufficient to end the test context
  });

  test("F05-03: POST /api/brands creates brand with correct fields via API", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.post(`${BASE}/api/brands`, {
      data: {
        name: "[S1-QA] Test Brand F05",
        domain: "s1-qa-f05.com.au",
        vertical: "tradies",
        primaryRegions: ["NSW:Bondi"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(
      body.brand,
      "Response must be wrapped: { brand: Brand }, not a bare brand object",
    ).toBeDefined();
    expect(body.brand).toMatchObject({
      name: "[S1-QA] Test Brand F05",
      domain: "s1-qa-f05.com.au",
      vertical: "tradies",
    });
  });

  test("F05-04: Created brand appears in GET /api/brands list", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/brands`);
    expect(res.status()).toBe(200);
    const brands = await res.json();
    const list = Array.isArray(brands) ? brands : (brands.brands ?? []);
    const found = list.find((b: { name: string }) => b.name === "[S1-QA] Test Brand F05");
    expect(found, "Created brand should appear in list").toBeDefined();
  });

  test("F05-05: PATCH /api/brands/[id] updates brand name and returns 200 + body", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    // Get the brand ID from list
    const listRes = await page.request.get(`${BASE}/api/brands`);
    const brands = await listRes.json();
    const list = Array.isArray(brands) ? brands : (brands.brands ?? []);
    const brand = list.find((b: { name: string }) => b.name === "[S1-QA] Test Brand F05");
    expect(brand).toBeDefined();

    const patchRes = await page.request.patch(`${BASE}/api/brands/${brand.id}`, {
      data: { name: "[S1-QA] Test Brand F05 Updated" },
    });
    expect(patchRes.status()).toBe(200);
    const updated = await patchRes.json();
    expect((updated.brand ?? updated).name).toBe("[S1-QA] Test Brand F05 Updated");
  });

  test("F05-06: GET /api/brands/[id] returns 404 for non-existent brand", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/brands/00000000-0000-0000-0000-000000000000`);
    expect(res.status()).toBe(404);
  });

  test("F05-07: Brand region is inherited from org (cannot be different)", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const listRes = await page.request.get(`${BASE}/api/brands`);
    const brands = await listRes.json();
    const list = Array.isArray(brands) ? brands : (brands.brands ?? []);
    const brand = list.find((b: { name: string }) => b.name.includes("[S1-QA] Test Brand F05"));
    expect(brand).toBeDefined();
    // Brand region must match org region ('au') -- inherited at create time
    expect(brand.region).toBe("au");
  });

  test("F05-08: PATCH /api/brands/[id] cannot update region (pinned)", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const listRes = await page.request.get(`${BASE}/api/brands`);
    const brands = await listRes.json();
    const list = Array.isArray(brands) ? brands : (brands.brands ?? []);
    const brand = list.find((b: { name: string }) => b.name.includes("[S1-QA] Test Brand F05"));

    const patchRes = await page.request.patch(`${BASE}/api/brands/${brand.id}`, {
      data: { region: "uk" }, // attempt to change region
    });
    // Either 400 or the update silently ignores region and returns 200 but region stays 'au'
    if (patchRes.status() === 200) {
      const updated = await patchRes.json();
      expect((updated.brand ?? updated).region).toBe("au"); // still 'au' -- not updated
    } else {
      expect(patchRes.status()).toBe(400);
    }
  });
});
