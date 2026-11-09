import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { audits, brands, organizations } from "../../../../../db/schema";
import { db } from "../../shared/db";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

let brandId = "";
let orgId = "";

test.describe("F01: Audit Creation (Sprint 2)", () => {
  test.beforeAll(async () => {
    // Get org ID from DB (seeded by seed script)
    const [org] = await db.select().from(organizations);
    if (!org) throw new Error("No org found — run seed script first");
    orgId = org.id;

    // Seed a brand directly in DB (avoids API auth complexity)
    const [brand] = await db
      .insert(brands)
      .values({
        organizationId: orgId,
        name: "[S2-QA] Audit Test Brand",
        domain: `s2qa-audit-${Date.now()}.com.au`,
        vertical: "tradies",
        region: "au",
      })
      .returning();
    brandId = brand.id;
  });

  test.afterAll(async () => {
    try {
      if (brandId) {
        await db.delete(audits).where(eq(audits.brandId, brandId));
        await db.delete(brands).where(eq(brands.id, brandId));
      }
    } catch {
      /* cleanup best-effort */
    }
  });

  test("F01-01: POST /api/audits creates audit with 201", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.post(`${BASE}/api/audits`, {
      data: { brandId, scenario: "happy_path" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.auditId).toBeTruthy();
    expect(body.auditNumber).toBeGreaterThanOrEqual(1);
  });

  test("F01-02: POST /api/audits returns 404 for non-existent brand", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const res = await page.request.post(`${BASE}/api/audits`, {
      data: { brandId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(res.status()).toBe(404);
  });

  // F01-03: Validation of empty/bad body is covered by unit tests (audits-create.test.ts)
});
