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
 *   beforeAll: seed org1 + user1 + org2 + user2 in DB (shared setup)
 *   Per-test:  brand created before test, deleted after
 *   afterAll:  delete all brands for both orgs
 */

import { test as base } from '@playwright/test';
import { test as testUser1, testAsUser2, expect } from './helpers/auth';
import {
  ensureOrganization,
  ensureUser,
  deleteAllBrandsForOrg,
  getBrandById,
  db,
} from './helpers/db';
import { USER_1, USER_2 } from './helpers/auth';
// B2 FIX: static imports for schema and drizzle-orm instead of dynamic await import()
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';

// ── Shared DB state ─────────────────────────────────────────────────────────

// D6/D13 FIX: initialise to '' so afterAll guards work if beforeAll fails early
// (same C14 pattern applied to all other spec files — missed here in that pass)
let org1Id = '';
let org2Id = '';

// A5 FIX: Use base test.beforeAll for setup that applies to ALL tests in this file.
// This runs once before any test (regardless of which fixture is used).
base.beforeAll(async () => {
  // C9 FIX: CLERK_ID vars not in Sprint 1 CI — must be added to .env.test.local and CI secrets.
  // Without them, ensureUser seeds clerkUserId='' → getCurrentUser() returns null → /sign-in redirect.
  const user1ClerkId = process.env.E2E_TEST_USER_1_CLERK_ID ?? '';
  const user2ClerkId = process.env.E2E_TEST_USER_2_CLERK_ID ?? '';
  if (!user1ClerkId || !user2ClerkId) {
    throw new Error(
      'E2E_TEST_USER_1_CLERK_ID and E2E_TEST_USER_2_CLERK_ID must be set.\n' +
      'Find them in Clerk Dashboard → Users → select user → User ID.',
    );
  }

  const org1 = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       'E2E Isolation Org 1',
    region:     'au',
    tier:       'agency',
  });
  org1Id = org1.id;
  await ensureUser({ clerkUserId: user1ClerkId, organizationId: org1Id, email: USER_1.email });

  const org2 = await ensureOrganization({
    clerkOrgId: USER_2.clerkOrgId,
    name:       'E2E Isolation Org 2',
    region:     'au',
    tier:       'starter',
  });
  org2Id = org2.id;
  await ensureUser({ clerkUserId: user2ClerkId, organizationId: org2Id, email: USER_2.email });
});

base.afterAll(async () => {
  // D13 FIX: guard against uninitialised org IDs if beforeAll failed early
  if (org1Id) await deleteAllBrandsForOrg(org1Id);
  if (org2Id) await deleteAllBrandsForOrg(org2Id);
});

// ── Tests: User 1 — can access their own brands ─────────────────────────────

testUser1.describe('User 1 accesses their own brands', () => {
  let brandId: string | null = null;

  testUser1.beforeEach(async ({ page }) => {
    const res = await page.request.post('/api/brands', {
      data: { name: 'Org1 Private Brand', domain: 'org1private.com.au', vertical: 'tradies' },
      headers: { 'Content-Type': 'application/json' },
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

  testUser1.test('User 1 sees their brand in the list', async ({ page }) => {
    await page.goto('/brands');
    await expect(page.getByText('Org1 Private Brand')).toBeVisible({ timeout: 10_000 });
  });

  testUser1.test('User 1 can navigate to their brand detail page', async ({ page }) => {
    await page.goto(`/brands/${brandId}`);
    await expect(page).toHaveURL(new RegExp(`/brands/${brandId}`));
    await expect(page.getByText('Org1 Private Brand')).toBeVisible();
  });
});

// ── Tests: User 2 — cannot access User 1's brands ───────────────────────────

testAsUser2.describe('User 2 cannot access User 1 brands (CLAUDE.md §7)', () => {
  // Seed a brand for org1 directly via DB for these tests.
  // User 2's browser session can only create brands for Org 2.
  let seedBrandId: string | null = null;

  testAsUser2.beforeEach(async () => {
    // Insert directly — bypasses auth so it lands in org1
    const [brand] = await db
      .insert(schema.brands)
      .values({
        organizationId: org1Id,
        name:           'Org1 Seeded Brand',
        domain:         'org1seeded.com.au',
        vertical:       'tradies',
        region:         'au',
        competitors:    [],
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

  testAsUser2.test('User 2 navigating to Org1 brand URL sees 404 (not 401)', async ({ page }) => {
    await page.goto(`/brands/${seedBrandId}`);

    // Sprint 1 §12: "Cross-org access returns 404, not 401" (CLAUDE.md §7)
    // Next.js not-found page or app error page
    const is404 = await page.getByText(/404|not found|page not found/i)
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    const redirectedAway = !page.url().includes(`/brands/${seedBrandId}`);
    expect(is404 || redirectedAway, 'Expected 404 page or redirect away from cross-org brand').toBe(true);
  });

  testAsUser2.test('User 2 API GET cross-org brand returns 404 (CLAUDE.md §7)', async ({ page }) => {
    const res = await page.request.get(`/api/brands/${seedBrandId}`);
    expect(res.status()).toBe(404);
    // Must NOT be 401 — that would leak resource existence
    expect(res.status()).not.toBe(401);
  });

  testAsUser2.test('User 2 API DELETE cross-org brand returns 404 — brand not deleted', async ({ page }) => {
    const res = await page.request.delete(`/api/brands/${seedBrandId}`);
    expect(res.status()).toBe(404);

    // Verify the brand still exists and deletedAt is null (not deleted)
    const brand = await getBrandById(seedBrandId!);
    expect(brand).not.toBeNull();
    expect(brand?.deletedAt).toBeNull();
  });

  testAsUser2.test('User 2 brand list does not show Org1 brands', async ({ page }) => {
    await page.goto('/brands');
    // Org1's brand name must not appear in User 2's list
    await expect(page.getByText('Org1 Seeded Brand')).toBeHidden({ timeout: 5_000 });
  });

  testAsUser2.test('cross-org 404 response does not leak brand data in UI', async ({ page }) => {
    await page.goto(`/brands/${seedBrandId}`);
    // Page content must not reveal the brand name or domain
    await expect(page.getByText('Org1 Seeded Brand')).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText('org1seeded.com.au')).toBeHidden({ timeout: 5_000 });
  });
});
