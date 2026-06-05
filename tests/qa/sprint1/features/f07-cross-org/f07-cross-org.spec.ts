import { expect, test } from "@playwright/test";
import { cleanupOrg } from "../../shared/cleanup";
import { seedBrand, seedOrg, seedUser } from "../../shared/seed";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

let org1DbId = "";
let org2DbId = "";
let brand1Id = ""; // belongs to org1; org2 user will try to access

test.describe("F07: Multi-tenant isolation -- cross-org 404", () => {
  test.beforeAll(async () => {
    // Org 1 (User 1)
    const org1 = await seedOrg({
      clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
      name: "[S1-QA] F07 Org A",
      region: "au",
      tier: "free",
    });
    org1DbId = org1.id;
    await seedUser({
      clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!,
      organizationId: org1DbId,
      email: process.env.E2E_TEST_USER_1_EMAIL!,
    });
    const brand1 = await seedBrand({
      organizationId: org1DbId,
      name: "[S1-QA] F07 Org A Brand",
      domain: "s1-qa-f07-orga.com.au",
    });
    brand1Id = brand1.id;

    // Org 2 (User 2) -- also seeds a brand so F07-05 proves isolation, not just an empty list
    const org2 = await seedOrg({
      clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!,
      name: "[S1-QA] F07 Org B",
      region: "au",
      tier: "free",
    });
    org2DbId = org2.id;
    await seedUser({
      clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!,
      organizationId: org2DbId,
      email: process.env.E2E_TEST_USER_2_EMAIL!,
    });
    await seedBrand({
      organizationId: org2DbId,
      name: "[S1-QA] F07 Org B Brand",
      domain: "s1-qa-f07-orgb.com.au",
    });
  });

  test.afterAll(async () => {
    await cleanupOrg(org1DbId);
    await cleanupOrg(org2DbId);
  });

  test("F07-01: User B GET /api/brands/[orgABrandId] returns 404 (NOT 401)", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_2_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_2_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/brands/${brand1Id}`);
    // CRITICAL: must be 404, NOT 401
    expect(res.status()).toBe(404);
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });

  test("F07-02: User B PATCH /api/brands/[orgABrandId] returns 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_2_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_2_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.patch(`${BASE}/api/brands/${brand1Id}`, {
      data: { name: "HACKED!" },
    });
    expect(res.status()).toBe(404);
  });

  test("F07-03: User B DELETE /api/brands/[orgABrandId] returns 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_2_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_2_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.delete(`${BASE}/api/brands/${brand1Id}`);
    expect(res.status()).toBe(404);
  });

  test("F07-04: User A can still GET their own brand (not affected by isolation test)", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/brands/${brand1Id}`);
    expect(res.status()).toBe(200);
  });

  test("F07-05: User B GET /api/brands list does not include Org A brands", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_2_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_2_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/brands`);
    const body = await res.json();
    const list = Array.isArray(body) ? body : (body.brands ?? []);
    const orgABrand = list.find((b: { id: string }) => b.id === brand1Id);
    expect(orgABrand, "Org A brand must NOT appear in Org B list").toBeUndefined();
  });

  test("F07-06: Unauthenticated GET /api/brands/[id] does not return brand JSON", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/brands/${brand1Id}`);
    // Better Auth middleware redirects to sign-in — the response is NOT a valid brand JSON
    const text = await res.text();
    let hasBrandData = false;
    try {
      const json = JSON.parse(text);
      hasBrandData = !!json.brand?.id;
    } catch {
      hasBrandData = false;
    }
    expect(hasBrandData, "Unauthenticated request must not return brand data").toBe(false);
  });
});
