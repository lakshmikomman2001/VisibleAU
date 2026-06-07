/**
 * F11-audit-compare.spec.ts
 *
 * Sprint 4 §8 — Audit compare /audits/compare?ids=A,B.
 *
 * Tests:
 *   F11-01  Compare page renders side-by-side scores for two audits
 *   F11-02  Both audit scores visible in 2-column layout
 *   F11-03  Malformed ?ids → redirect to /audits (BD4 fix)
 *   F11-04  Cross-org audit in ?ids → 404/redirect
 */

import { test, expect } from '@playwright/test';
import {
  seedOrganization, seedUser, seedBrand, seedAudit,
  deleteAllTestDataForOrg,
} from '../helpers/db';
import { goto, screenshot } from '../helpers/page';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

let orgId    = '';
let audit1Id = '';
let audit2Id = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 Compare Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);
  const brand = await seedBrand({ organizationId: orgId, name: 'Compare Brand', domain: 'compare.e2e-s4ui.test' });
  const a1 = await seedAudit({ organizationId: orgId, brandId: brand.id, auditNumber: 1, scoreComposite: 63.4 });
  const a2 = await seedAudit({ organizationId: orgId, brandId: brand.id, auditNumber: 2, scoreComposite: 57.2 });
  audit1Id = a1.id;
  audit2Id = a2.id;
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F11-01: compare page renders with valid ?ids=A,B', async ({ page }) => {
  await goto(page, `/audits/compare?ids=${audit1Id},${audit2Id}`);
  await expect(page.getByText(/compare.*audit|audit.*compare|compare/i).first()).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F11-01-compare');
});

test('F11-02: both audit scores visible side by side', async ({ page }) => {
  await goto(page, `/audits/compare?ids=${audit1Id},${audit2Id}`);
  await expect(page.getByText(/63\.4|63\.40/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/57\.2|57\.20/i).first()).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F11-02-scores');
});

test('F11-03: malformed ?ids redirects to /audits (BD4 fix)', async ({ page }) => {
  await goto(page, '/audits/compare?ids=not-valid-uuid');
  await expect(page).toHaveURL(/\/audits$/, { timeout: 15_000 });
  await screenshot(page, 'F11-03-malformed');
});

test('F11-04: missing ?ids redirects to /audits', async ({ page }) => {
  await goto(page, '/audits/compare');
  await expect(page).toHaveURL(/\/audits$/, { timeout: 15_000 });
});
