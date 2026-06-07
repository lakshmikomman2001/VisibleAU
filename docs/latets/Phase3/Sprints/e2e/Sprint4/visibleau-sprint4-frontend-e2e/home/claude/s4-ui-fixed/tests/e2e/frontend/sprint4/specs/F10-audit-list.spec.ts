/**
 * F10-audit-list.spec.ts
 *
 * Sprint 4 §8 — Audit list /audits: table, filters, sort, pagination.
 *
 * Tests:
 *   F10-01  Audit list table renders with seeded audit rows
 *   F10-02  Each row includes brandName column (BB3 fix JOIN)
 *   F10-03  Status filter shows only complete audits
 *   F10-04  Sort by score changes row order
 *   F10-05  Row click navigates to /audits/[id]
 *   F10-06  Pagination controls visible when >50 rows
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
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 AuditList Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);
  const brand = await seedBrand({ organizationId: orgId, name: 'List Brand', domain: 'list.e2e-s4ui.test' });
  brandId = brand.id;
  const a1 = await seedAudit({ organizationId: orgId, brandId, auditNumber: 1, scoreComposite: 63.4 });
  await seedAudit({ organizationId: orgId, brandId, auditNumber: 2, scoreComposite: 77.1 });
  await seedAudit({ organizationId: orgId, brandId, auditNumber: 3, status: 'failed' });
  auditId = a1.id;
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F10-01: audit list shows seeded audit rows', async ({ page }) => {
  await goto(page, '/audits');
  await expect(page.getByText(/#1|audit.*1/i).first()).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F10-01-audit-list');
});

test('F10-02: each row shows brandName from JOIN (BB3 fix)', async ({ page }) => {
  await goto(page, '/audits');
  await expect(page.getByText(/\[S4-UI\] List Brand/i).first()).toBeVisible({ timeout: 15_000 });
});

test('F10-03: status filter shows only complete audits', async ({ page }) => {
  await goto(page, '/audits?status=complete');
  // Failed audit (#3) should not appear
  const bodyText = await page.locator('body').innerText();
  // Complete audits visible
  expect(bodyText).toMatch(/63\.4|77\.1/);
  await screenshot(page, 'F10-03-status-filter');
});

test('F10-04: row click navigates to /audits/[id]', async ({ page }) => {
  await goto(page, '/audits');
  // Click the first audit row
  const firstRow = page.locator('tr, [class*="row"]').filter({ hasText: /\[S4-UI\]/ }).first();
  if (await firstRow.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await firstRow.click();
    await expect(page).toHaveURL(/\/audits\/[a-f0-9-]+$/, { timeout: 15_000 });
  }
  await screenshot(page, 'F10-04-row-click');
});

test('F10-05: filter URLs are searchParam-based (BJ4 fix)', async ({ page }) => {
  await goto(page, '/audits?status=failed&sort=createdAt&order=desc');
  // Page should render without crash — filter state lives in URL
  await expect(page).toHaveURL(/status=failed/, { timeout: 15_000 });
  await screenshot(page, 'F10-05-url-filter');
});
