/**
 * 06-cross-org-isolation.spec.ts
 *
 * CLAUDE.md §7: "Never return 401 on cross-org access. Return 404."
 *
 * Sprint 2 adds /audits/[auditId] route — must enforce the same
 * cross-org isolation that Sprint 1 /brands/[brandId] enforces.
 *
 * Tests:
 *   - User 2 navigating to User 1's /audits/[id] → 404 page (not 200, not 401)
 *   - User 2's /audits list does NOT include User 1's audits
 *   - User 2 GET /api/audits/[id] → 404 JSON (not 401)
 *   - User 1 cannot trigger audit for User 2's brand
 */

import { test, testAsUser2, expect, USER_1, USER_2 } from './helpers/auth';
import { test as base } from '@playwright/test';
import {
  ensureOrganization, ensureUser, createBrand,
  seedCompletedAudit,
  deleteAuditsForOrg, deleteBrandsForOrg,
} from './helpers/db';

let org1Id      = '';
let org2Id      = '';
let brand1Id    = '';
let brand2Id    = '';
let org1AuditId = '';

base.beforeAll(async () => {
  // Org 1 — User 1
  const org1 = await ensureOrganization({ clerkOrgId: USER_1.clerkOrgId, name: 'E2E XOrg Sprint2 Org1', tier: 'agency' });
  org1Id = org1.id;
  await ensureUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '', organizationId: org1Id, email: USER_1.email });
  const b1 = await createBrand({ organizationId: org1Id, name: 'Org1 Secret Brand E2E', domain: 'org1secret.e2e.test', vertical: 'tradies' });
  brand1Id = b1.id;

  // Org 2 — User 2
  const org2 = await ensureOrganization({ clerkOrgId: USER_2.clerkOrgId, name: 'E2E XOrg Sprint2 Org2', tier: 'starter' });
  org2Id = org2.id;
  await ensureUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID ?? '', organizationId: org2Id, email: USER_2.email });
  const b2 = await createBrand({ organizationId: org2Id, name: 'Org2 Brand E2E', domain: 'org2brand.e2e.test', vertical: 'saas' });
  brand2Id = b2.id;

  // Seed a completed audit for Org 1 — User 2 must NOT be able to see it
  const a1 = await seedCompletedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, scoreComposite: 80 });
  org1AuditId = a1.id;
});

base.afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org2Id) await deleteAuditsForOrg(org2Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
  if (org2Id) await deleteBrandsForOrg(org2Id);
});

// User 1 can access their own audit
test.describe('Sprint 2 cross-org — User 1 owns audit', () => {
  test('TC-F2-60: User 1 can access /audits/[org1AuditId] (their own)', async ({ page }) => {
    await page.goto(`/audits/${org1AuditId}`);
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page).not.toHaveURL(/404/);
    // Should see audit content, not be redirected away
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
  });
});

// User 2 cannot access User 1's audit
testAsUser2.describe('Sprint 2 cross-org — User 2 cannot access User 1 audit (CLAUDE.md §7)', () => {

  testAsUser2('TC-F2-61: User 2 browser nav to /audits/[org1AuditId] shows 404 (not 401)', async ({ page }) => {
    await page.goto(`/audits/${org1AuditId}`);
    // Must see 404 page, not the audit data
    const is404 = await page.getByText(/404|not found|page not found/i)
      .isVisible({ timeout: 10_000 }).catch(() => false);
    const redirectedAway = !page.url().includes(org1AuditId);
    expect(is404 || redirectedAway, 'User 2 must see 404 for org1 audit').toBe(true);
    // Must NOT see the audit content
    await expect(page.getByText('Org1 Secret Brand E2E')).not.toBeVisible();
  });

  testAsUser2('TC-F2-62: User 2 API GET /api/audits/[org1AuditId] → 404 NOT 401', async ({ page }) => {
    const res = await page.request.get(`/api/audits/${org1AuditId}`);
    expect(res.status()).toBe(404);
    expect(res.status()).not.toBe(401);
    // Response body must not leak org1 audit data
    const body = await res.text();
    expect(body).not.toContain('Org1 Secret Brand');
    expect(body).not.toContain(org1Id);
  });

  testAsUser2('TC-F2-63: User 2 /audits list does NOT show User 1 audits', async ({ page }) => {
    await page.goto('/audits');
    await expect(page).not.toHaveURL(/sign-in/);
    // User 1's brand must NOT appear in User 2's audit list
    await expect(page.getByText('Org1 Secret Brand E2E')).not.toBeVisible({ timeout: 5_000 });
  });

  testAsUser2('TC-F2-64: User 2 POST /api/audits with User 1 brandId → 404', async ({ page }) => {
    const res = await page.request.post('/api/audits', {
      data:    { brandId: brand1Id },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(404);
    expect(res.status()).not.toBe(401);
  });
});
