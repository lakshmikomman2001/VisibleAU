/**
 * F08 — Cross-org isolation: Sprint 3 new routes
 *
 * Verifies that the two new Sprint 3 routes enforce org isolation:
 *   GET /api/audits/[auditId]/full  → 404 for wrong org
 *   GET /api/audits/[auditId]/full  → 404 for wrong org (AA3 fix: /rich page is Sprint 4)
 *
 * Uses DB-seeded complete audits — no Inngest required.
 *
 * TC-F08-01  User 2 GET /api/audits/[org1-auditId]/full → 404 not 401
 * TC-F08-02  AA3 FIX: User 2 GET /api/audits/[org1-auditId]/full → 404 (API isolation)
 * TC-F08-03  User 2 GET /api/brands/[org1-brandId]/metrics → 404 not 401
 * TC-F08-04  User 1 can access own /api/audits/[id]/full (control test — AA3 fix)
 * TC-F08-05  User 1 /audits page does not show org2 brand names
 */

import {
  test, testAsUser2, expect, assertEnvVars,
  ensureOrg1, ensureOrg2, createQABrand,
  deleteQAData, seedSprint3Audit,
} from '../helpers/setup';
import { test as base } from '@playwright/test';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let audit1Id = '';

base.beforeAll(async () => {
  assertEnvVars();
  const r1 = await ensureOrg1();
  org1Id = r1.orgId;
  const r2 = await ensureOrg2();
  org2Id = r2.orgId;

  await deleteQAData(org1Id);
  await deleteQAData(org2Id);

  brand1Id = await createQABrand(org1Id, 'F08');

  // Seed a complete Sprint 3 audit for org1 — org2 user should NOT access this
  audit1Id = await seedSprint3Audit({
    organizationId: org1Id,
    brandId:        brand1Id,
    auditNumber:    1,
  });
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
  if (org2Id) await deleteQAData(org2Id);
});

test.describe('F08 — Cross-org: User 1 data (control)', () => {

  test('TC-F08-04: AA3 FIX — User 1 GET /api/audits/[id]/full returns 200 (control)', async ({ page }) => {
    // AA3 FIX: /audits/[id]/rich is Sprint 4. Test the Sprint 3 API instead.
    const res = await page.request.get(`/api/audits/${audit1Id}/full`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { audit: { id: string } };
    expect(body.audit.id).toBe(audit1Id);
  });
});

testAsUser2.describe('F08 — Cross-org: User 2 cannot access User 1 data', () => {

  testAsUser2('TC-F08-01: User 2 GET /api/audits/[org1-id]/full → 404 not 401', async ({ page }) => {
    const res = await page.request.get(`/api/audits/${audit1Id}/full`);
    expect(res.status()).toBe(404);
    expect(res.status()).not.toBe(401);
    const body = await res.text();
    expect(body).not.toContain(org1Id);
  });

  testAsUser2('TC-F08-02: AA3 FIX — User 2 GET /api/audits/[org1-id]/full → 404 (API isolation)', async ({ page }) => {
    // AA3 FIX: /audits/[id]/rich page is Sprint 4 scope (does not exist in Sprint 3).
    // Test the Sprint 3 API route instead: /api/audits/[id]/full must return 404 cross-org.
    const res  = await page.request.get(`/api/audits/${audit1Id}/full`);
    expect(res.status()).toBe(404);
    expect(res.status()).not.toBe(401);
    const body = await res.text();
    expect(body).not.toContain(org1Id);
  });

  testAsUser2('TC-F08-03: User 2 GET /api/brands/[org1-brandId]/metrics → 404 not 401', async ({ page }) => {
    const res = await page.request.get(`/api/brands/${brand1Id}/metrics`);
    expect(res.status()).toBe(404);
    expect(res.status()).not.toBe(401);
  });

  testAsUser2('TC-F08-05: User 1 brand names do not appear in User 2 /audits list', async ({ page }) => {
    await page.goto('/audits');
    await expect(page).not.toHaveURL(/sign-in/);
    const bodyText = await page.locator('body').innerText({ timeout: 12_000 });
    // '[QA-S3] Bondi Plumbing F08' is org1 brand — must not appear for org2 user
    expect(bodyText).not.toContain('[QA-S3] Bondi Plumbing F08');
  });
});
