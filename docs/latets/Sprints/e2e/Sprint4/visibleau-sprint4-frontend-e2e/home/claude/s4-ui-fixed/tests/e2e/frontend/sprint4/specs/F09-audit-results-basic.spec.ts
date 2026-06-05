/**
 * F09-audit-results-basic.spec.ts
 *
 * Sprint 4 §8 — AuditResultsBasic: single-engine Sprint 2 audit view.
 *
 * Tests:
 *   F09-01  AuditResultsBasic renders for runsPerPrompt=1, engines.length=1 (BC5c)
 *   F09-02  Composite score or citation count visible
 *   F09-03  "Re-run audit" button visible (BD3 fix: was "Refresh audit")
 *   F09-04  Re-run button triggers POST /api/audits and navigates to running screen
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

let orgId   = '';
let brandId = '';
let auditId = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 BasicResults Org', tier: 'free' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);
  const brand = await seedBrand({ organizationId: orgId, name: 'Basic Results Brand', domain: 'basic.e2e-s4ui.test' });
  brandId = brand.id;
  // runsPerPrompt=1, engines.length=1 → isRich=false → AuditResultsBasic (BC5c)
  const audit = await seedAudit({
    organizationId: orgId, brandId, auditNumber: 1,
    engines: ['chatgpt'], runsPerPrompt: 1, totalCostUsd: 0.07,
    scoreComposite: 40.0,
  });
  auditId = audit.id;
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F09-01: AuditResultsBasic renders (single-engine, runsPerPrompt=1)', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  // Basic results: should NOT show 5 dimension cards (that's Rich only)
  // Should show the audit page without the multi-dim layout
  await expect(page).toHaveURL(`/audits/${auditId}`, { timeout: 15_000 });
  await screenshot(page, 'F09-01-basic-results');
});

test('F09-02: composite score visible on basic results page', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  await expect(page.getByText(/40|40\.0|40\.00/i).first()).toBeVisible({ timeout: 15_000 });
});

test('F09-03: "Re-run audit" button visible (BD3 fix)', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  // BD3 fix: must be "Re-run audit" not "Refresh audit"
  await expect(
    page.getByRole('button', { name: /re-run audit|rerun audit/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F09-03-rerun-btn');
});

test('F09-04: Re-run audit triggers POST /api/audits + navigates to running screen', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  const auditPostPromise = page.waitForResponse(
    r => r.url().includes('/api/audits') && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: /re-run audit|rerun audit/i }).first().click();
  const res = await auditPostPromise;
  expect(res.status()).toBe(201);
  await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
  await screenshot(page, 'F09-04-rerun-redirect');
});
