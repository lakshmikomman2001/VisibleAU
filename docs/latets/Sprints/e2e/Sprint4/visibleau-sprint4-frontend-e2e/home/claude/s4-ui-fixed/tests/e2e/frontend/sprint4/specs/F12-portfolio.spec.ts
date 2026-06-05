/**
 * F12-portfolio.spec.ts
 *
 * Sprint 4 §8 — Portfolio /portfolio: ≥2 brands required.
 *
 * Tests:
 *   F12-01  1 brand → redirects to /dashboard?toast=need-2-brands (BE3 fix)
 *   F12-02  2+ brands → portfolio renders with brand grid
 *   F12-03  Portfolio shows aggregate KPIs (avg visibility, audits this month, spend)
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
let brand1Id = '';
let brand2Id = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 Portfolio Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);
  const b1 = await seedBrand({ organizationId: orgId, name: 'Portfolio Brand 1', domain: 'port1.e2e-s4ui.test' });
  const b2 = await seedBrand({ organizationId: orgId, name: 'Portfolio Brand 2', domain: 'port2.e2e-s4ui.test' });
  brand1Id = b1.id;
  brand2Id = b2.id;
  await seedAudit({ organizationId: orgId, brandId: brand1Id, auditNumber: 1, scoreComposite: 63.4 });
  await seedAudit({ organizationId: orgId, brandId: brand2Id, auditNumber: 1, scoreComposite: 71.0 });
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F12-01: H14 FIX — 1 brand → portfolio redirects to /dashboard?toast=need-2-brands (BE3 fix)', async ({ page }) => {
  // H14 FIX: original had restore AFTER the assertion. If the assertion timed out,
  // the restore was skipped → brand2 stayed soft-deleted → F12-02 and F12-03 failed.
  // Fix: wrap in try/finally so restore always executes.
  const { db } = await import('../helpers/db');
  const { brands } = await import('../../../../../db/schema');
  const { eq } = await import('drizzle-orm');

  // Temporarily soft-delete brand2 so org has only 1 active brand
  await db.update(brands).set({ deletedAt: new Date() }).where(eq(brands.id, brand2Id));

  try {
    await goto(page, '/portfolio');
    // BE3: brandCount < 2 → server-side redirect('/dashboard?toast=need-2-brands')
    await expect(page).toHaveURL(/\/dashboard.*toast=need-2-brands/, { timeout: 15_000 });
    await screenshot(page, 'F12-01-portfolio-redirect');
  } finally {
    // Always restore brand2 so F12-02 and F12-03 see 2 active brands
    await db.update(brands).set({ deletedAt: null }).where(eq(brands.id, brand2Id));
  }
});

test('F12-02: 2+ brands → portfolio renders brand grid', async ({ page }) => {
  await goto(page, '/portfolio');
  await expect(page.getByText(/portfolio/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\[S4-UI\] Portfolio Brand 1/i).first()).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F12-02-portfolio-grid');
});

test('F12-03: portfolio shows aggregate KPI cards', async ({ page }) => {
  await goto(page, '/portfolio');
  // Portfolio has 4 aggregate KPIs
  for (const kpi of ['avg visibility', 'active brands', 'audits this month', 'monthly llm spend']) {
    await expect(page.getByText(new RegExp(kpi, 'i')).first()).toBeVisible({ timeout: 15_000 });
  }
  await screenshot(page, 'F12-03-portfolio-kpis');
});
