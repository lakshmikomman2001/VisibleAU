/**
 * tests/e2e/05-cross-org-isolation.spec.ts
 *
 * Frontend E2E: Cross-org isolation — browser + API perspective
 *
 * Sprint 1 §11 acceptance criteria:
 *   ✓ Second org user cannot access first org's brand URL (returns 404)
 *   ✓ Cross-org DELETE returns 404 (not 204 or 500)
 *   ✓ Brand name/domain NOT visible to second org user in their list
 *
 * CLAUDE.md §7 canonical: "Cross-org access returns 404, not 401."
 *
 * A5 FIX: The original used testUser1.beforeAll() which is NOT guaranteed
 * to run before testAsUser2.describe() blocks — each test instance has its
 * own fixture scope. Setup must use base-level beforeAll/afterAll.
 *
 * Pattern: Use test.beforeAll() from the base @playwright/test for shared
 * DB setup. Each describe block then uses the appropriate auth fixture (test
 * or testAsUser2) for its own tests.
 *
 * Test data lifecycle:
 *   beforeAll: two accounts, each in its own workspace (helpers/spec-account.ts)
 *   Per-test:  brand created before test, deleted after
 *   afterAll:  both accounts, their workspaces and every brand in them
 */

import { test as base } from "@playwright/test";
import { eq } from "drizzle-orm";
// B2 FIX: static imports for schema and drizzle-orm instead of dynamic await import()
import * as schema from "@/db/schema";
import { expect, testSignedInAs } from "./helpers/auth";
import { db, getBrandById } from "./helpers/db";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

// ── Shared DB state ─────────────────────────────────────────────────────────

// Two accounts, each with its own workspace (tests/e2e/helpers/spec-account.ts): user 1 on an
// Agency plan, user 2 on Starter.
let user1: SpecAccount;
let user2: SpecAccount;
let org1Id = "";
const testUser1 = testSignedInAs(() => user1);
const testAsUser2 = testSignedInAs(() => user2);

// A5 FIX: Use base test.beforeAll for setup that applies to ALL tests in this file.
// This runs once before any test (regardless of which fixture is used).
base.beforeAll(async () => {
  user1 = await createSpecAccount({ key: "root-05-user-1", plan: "agency" });
  user2 = await createSpecAccount({ key: "root-05-user-2", plan: "starter" });
  org1Id = user1.organizationId;
});

base.afterAll(async () => {
  await removeSpecAccount(user1);
  await removeSpecAccount(user2);
});

// ── Tests: User 1 — can access their own brands ─────────────────────────────

testUser1.describe("User 1 accesses their own brands", () => {
  let brandId: string | null = null;

  testUser1.beforeEach(async ({ page }) => {
    const res = await page.request.post("/api/brands", {
      data: { name: "Org1 Private Brand", domain: "org1private.com.au", vertical: "tradies" },
      headers: { "Content-Type": "application/json" },
    });
    const { brand } = await res.json();
    brandId = brand.id;
  });

  testUser1.afterEach(async ({ page }) => {
    if (brandId) {
      await page.request.delete(`/api/brands/${brandId}`).catch(() => {});
      brandId = null;
    }
  });

  testUser1("User 1 sees their brand in the list", async ({ page }) => {
    await page.goto("/brands");
    // The brand's row; its name is also on the brand switcher.
    await expect(page.getByRole("link", { name: /Org1 Private Brand/ })).toBeVisible({
      timeout: 10_000,
    });
  });

  testUser1("User 1 can navigate to their brand detail page", async ({ page }) => {
    await page.goto(`/brands/${brandId}`);
    await expect(page).toHaveURL(new RegExp(`/brands/${brandId}`));
    await expect(page.getByRole("heading", { name: "Org1 Private Brand", level: 1 })).toBeVisible();
  });
});

// ── Tests: User 2 — cannot access User 1's brands ───────────────────────────

testAsUser2.describe("User 2 cannot access User 1 brands (CLAUDE.md §7)", () => {
  // Seed a brand for org1 directly via DB for these tests.
  // User 2's browser session can only create brands for Org 2.
  let seedBrandId: string | null = null;

  testAsUser2.beforeEach(async () => {
    // Insert directly — bypasses auth so it lands in org1
    const [brand] = await db
      .insert(schema.brands)
      .values({
        organizationId: org1Id,
        name: "Org1 Seeded Brand",
        domain: "org1seeded.com.au",
        vertical: "tradies",
        region: "au",
        competitors: [],
        primaryRegions: [],
      })
      .returning();
    seedBrandId = brand.id;
  });

  testAsUser2.afterEach(async () => {
    if (seedBrandId) {
      // Hard-delete the seeded brand
      await db.delete(schema.brands).where(eq(schema.brands.id, seedBrandId));
      seedBrandId = null;
    }
  });

  testAsUser2("User 2 navigating to Org1 brand URL sees 404 (not 401)", async ({ page }) => {
    await page.goto(`/brands/${seedBrandId}`);

    // Sprint 1 §12: "Cross-org access returns 404, not 401" (CLAUDE.md §7): the app's not-found page.
    // Waited for: isVisible() doesn't wait (its timeout is ignored), so this passed or failed on how
    // fast the page rendered (flaky in the 9 Nov run).
    await expect(page.getByText(/404|not found|page not found/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Org1 Seeded Brand" })).toHaveCount(0);
  });

  testAsUser2("User 2 API GET cross-org brand returns 404 (CLAUDE.md §7)", async ({ page }) => {
    const res = await page.request.get(`/api/brands/${seedBrandId}`);
    expect(res.status()).toBe(404);
    // Must NOT be 401 — that would leak resource existence
    expect(res.status()).not.toBe(401);
  });

  testAsUser2(
    "User 2 API DELETE cross-org brand returns 404 — brand not deleted",
    async ({ page }) => {
      const res = await page.request.delete(`/api/brands/${seedBrandId}`);
      expect(res.status()).toBe(404);

      // Verify the brand still exists and deletedAt is null (not deleted)
      const brand = await getBrandById(seedBrandId!);
      expect(brand).not.toBeNull();
      expect(brand?.deletedAt).toBeNull();
    },
  );

  testAsUser2("User 2 brand list does not show Org1 brands", async ({ page }) => {
    await page.goto("/brands");
    // Org1's brand name must not appear in User 2's list
    await expect(page.getByText("Org1 Seeded Brand")).toBeHidden({ timeout: 5_000 });
  });

  testAsUser2("cross-org 404 response does not leak brand data in UI", async ({ page }) => {
    await page.goto(`/brands/${seedBrandId}`);
    // Page content must not reveal the brand name or domain
    await expect(page.getByText("Org1 Seeded Brand")).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText("org1seeded.com.au")).toBeHidden({ timeout: 5_000 });
  });
});

// S01 part 12 (LLD 11 "Cross-workspace data access", contract P13, P17): reports across workspaces. User 2 can't read
// or start anything about Org1's brand's reports, and a portal link lists only its own brand's reports.
testAsUser2.describe("S01: reports stay in their workspace", () => {
  let reportBrandId = "";
  let otherBrandId = "";
  let token = "";

  base.beforeAll(async () => {
    const [brand] = await db
      .insert(schema.brands)
      .values({
        organizationId: org1Id,
        name: "Org1 Report Brand",
        domain: "org1reports.com.au",
        vertical: "tradies",
        region: "au",
        competitors: [],
        primaryRegions: [],
      })
      .returning();
    reportBrandId = brand.id;
    const [other] = await db
      .insert(schema.brands)
      .values({
        organizationId: org1Id,
        name: "Org1 Other Brand",
        domain: "org1other.com.au",
        vertical: "tradies",
        region: "au",
        competitors: [],
        primaryRegions: [],
      })
      .returning();
    otherBrandId = other.id;
    for (const [brandId, headline] of [
      [reportBrandId, "Portal brand report"],
      [otherBrandId, "Other brand report"],
    ] as const) {
      await db.insert(schema.generatedReports).values({
        brandId,
        organizationId: org1Id,
        reportType: "weekly",
        periodLabel: brandId === reportBrandId ? "2026-W47" : "2026-W46",
        headline,
        narrativeText: "n",
        pdfUrl: `${org1Id}/${brandId}.pdf`,
        reportTier: "standard",
        contentsSnapshot: { schema: 1, tierName: brandId === reportBrandId ? "Gold" : "Silver" },
      });
    }
    token = `e2e-portal-${reportBrandId}`;
    await db.insert(schema.clientPortalInvites).values({
      organizationId: org1Id,
      brandId: reportBrandId,
      inviteToken: token,
      inviteeName: "Org1 client",
    });
    await db
      .insert(schema.orgFeatureFlags)
      .values({ organizationId: org1Id, flagKey: "report_v2", isEnabled: true });
  });

  base.afterAll(async () => {
    await db
      .delete(schema.orgFeatureFlags)
      .where(eq(schema.orgFeatureFlags.organizationId, org1Id));
    await db
      .delete(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.inviteToken, token));
    for (const id of [reportBrandId, otherBrandId]) {
      await db.delete(schema.generatedReports).where(eq(schema.generatedReports.brandId, id));
      await db.delete(schema.brands).where(eq(schema.brands.id, id));
    }
  });

  testAsUser2(
    "User 2 can't list, start or read the contents of Org1's reports (404)",
    async ({ page }) => {
      expect((await page.request.get(`/api/brands/${reportBrandId}/reports`)).status()).toBe(404);
      expect(
        (await page.request.get(`/api/brands/${reportBrandId}/report-preferences`)).status(),
      ).toBe(404);
      const started = await page.request.post(`/api/brands/${reportBrandId}/reports/generate`, {
        data: { periodType: "weekly", tier: "basic" },
      });
      expect(started.status()).toBe(404);
    },
  );

  testAsUser2("a portal link lists only its own brand's reports", async ({ page }) => {
    await page.goto(`/client-portal/${token}`);
    const reports = page.getByTestId("p13-reports");
    await expect(reports).toBeVisible();
    await expect(page.getByTestId("p13-row")).toHaveCount(1);
    await expect(reports).toContainText("Gold");
    await expect(reports).not.toContainText("Silver");
  });
});
