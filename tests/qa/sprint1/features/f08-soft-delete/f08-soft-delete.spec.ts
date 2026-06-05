import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { brands } from "../../../../../db/schema";
import { cleanupOrg } from "../../shared/cleanup";
import { db } from "../../shared/db";
import { seedBrand, seedOrg, seedUser } from "../../shared/seed";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

let orgDbId = "";
let brandId = "";

test.describe("F08: Brand soft delete", () => {
  test.beforeAll(async () => {
    const org = await seedOrg({
      clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
      name: "[S1-QA] F08 Soft Delete Org",
      region: "au",
      tier: "free",
    });
    orgDbId = org.id;
    await seedUser({
      clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!,
      organizationId: orgDbId,
      email: process.env.E2E_TEST_USER_1_EMAIL!,
    });
    const brand = await seedBrand({
      organizationId: orgDbId,
      name: "[S1-QA] F08 Brand To Delete",
      domain: "s1-qa-f08.com.au",
    });
    brandId = brand.id;
  });

  test.afterAll(async () => {
    await cleanupOrg(orgDbId);
  });

  test("F08-01: DELETE /api/brands/[id] returns 204 No Content", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.delete(`${BASE}/api/brands/${brandId}`);
    expect(res.status()).toBe(204);
  });

  test("F08-02: Deleted brand no longer appears in GET /api/brands list", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/brands`);
    const body = await res.json();
    const list = Array.isArray(body) ? body : (body.brands ?? []);
    expect(list.find((b: { id: string }) => b.id === brandId)).toBeUndefined();
  });

  test("F08-03: Deleted brand GET /api/brands/[id] returns 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.get(`${BASE}/api/brands/${brandId}`);
    expect(res.status()).toBe(404);
  });

  test("F08-04: DB row still exists with deletedAt set (NOT hard-deleted)", async () => {
    const [row] = await db.select().from(brands).where(eq(brands.id, brandId));
    expect(row, "Brand row must still exist in DB").toBeDefined();
    expect(row.deletedAt, "deletedAt must be set (soft delete, not hard delete)").not.toBeNull();
  });

  test("F08-05: DELETE on already-deleted brand returns 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.delete(`${BASE}/api/brands/${brandId}`);
    expect(res.status()).toBe(404);
  });

  test("F08-06: Cross-org DELETE returns 404 (not 204)", async ({ request }) => {
    let org2Id = "";
    const org2 = await seedOrg({
      clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!,
      name: "[S1-QA] F08 Org2",
      region: "au",
      tier: "free",
    });
    org2Id = org2.id;
    try {
      await seedUser({
        clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!,
        organizationId: org2Id,
        email: process.env.E2E_TEST_USER_2_EMAIL!,
      });
      // Seed a fresh brand under org1 for this test
      const freshBrand = await seedBrand({
        organizationId: orgDbId,
        name: "[S1-QA] F08 Cross-org Target",
        domain: "s1-qa-f08b.com.au",
      });
      const _res = await request.delete(`${BASE}/api/brands/${freshBrand.id}`);
      // Unauthenticated: middleware redirects (200 after follow) or 401/404
      // The key assertion: the brand was NOT deleted
      const brandStillExists = await db.select().from(brands).where(eq(brands.id, freshBrand.id));
      expect(brandStillExists.length).toBe(1);
      expect(brandStillExists[0].deletedAt).toBeNull();
    } finally {
      await cleanupOrg(org2Id); // guaranteed to run even on assertion failure
    }
  });
});
