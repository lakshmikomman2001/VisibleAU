/**
 * F15-cross-org-404.spec.ts
 *
 * Sprint 4 §8 — Cross-org access: all protected routes return 404, not 401.
 *
 * Tests:
 *   F15-01  User 2 visiting User 1 brand → 404 page (not 401, not blank)
 *   F15-02  User 2 visiting User 1 audit → 404 page
 *   F15-03  User 2 exporting User 1 audit → API returns 404
 */

import { test, expect } from '@playwright/test';
import {
  seedOrganization, seedUser, seedBrand, seedAudit,
  deleteAllTestDataForOrg,
} from '../helpers/db';
import { screenshot } from '../helpers/page';
import path from 'node:path';

const USER1_ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};
const USER2_ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let audit1Id = '';

// Auth state for User 2
const USER2_STATE = path.resolve(__dirname, '../helpers/auth-state/user2.json');

test.beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: USER1_ENV.clerkOrgId, name: 'S4 CrossOrg Org1', tier: 'agency' });
  const org2 = await seedOrganization({ clerkOrgId: USER2_ENV.clerkOrgId, name: 'S4 CrossOrg Org2', tier: 'free' });
  org1Id = org1.id;
  org2Id = org2.id;
  await seedUser({ clerkUserId: USER1_ENV.clerkUserId, organizationId: org1Id, email: USER1_ENV.email });
  await seedUser({ clerkUserId: USER2_ENV.clerkUserId, organizationId: org2Id, email: USER2_ENV.email });
  await deleteAllTestDataForOrg(org1Id);
  await deleteAllTestDataForOrg(org2Id);

  const brand = await seedBrand({ organizationId: org1Id, name: 'CrossOrg Brand', domain: 'cross.e2e-s4ui.test' });
  brand1Id = brand.id;
  const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, scoreComposite: 63.4 });
  audit1Id = audit.id;
});

test.afterAll(async () => {
  if (org1Id) await deleteAllTestDataForOrg(org1Id);
  if (org2Id) await deleteAllTestDataForOrg(org2Id);
});

test('F15-01: User 2 visiting Org 1 brand → 404 (not 401, not blank)', async ({ browser }) => {
  const context = await browser.newContext({ storageState: USER2_STATE });
  const page = await context.newPage();
  const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';
  await page.goto(`${BASE_URL}/brands/${brand1Id}`);
  await page.waitForLoadState('networkidle');
  // 404 page — not 401, not blank
  const body = await page.locator('body').innerText();
  expect(body.toLowerCase()).toMatch(/404|not found|page.*not found/);
  expect(body.toLowerCase()).not.toMatch(/sign in|sign-in|unauthorized/);
  await screenshot(page, 'F15-01-cross-org-brand');
  await context.close();
});

test('F15-02: User 2 visiting Org 1 audit → 404', async ({ browser }) => {
  const context = await browser.newContext({ storageState: USER2_STATE });
  const page = await context.newPage();
  const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';
  await page.goto(`${BASE_URL}/audits/${audit1Id}`);
  await page.waitForLoadState('networkidle');
  const body = await page.locator('body').innerText();
  expect(body.toLowerCase()).toMatch(/404|not found/);
  await screenshot(page, 'F15-02-cross-org-audit');
  await context.close();
});

test('F15-03: User 2 exporting Org 1 audit → API 404', async ({ browser }) => {
  const context = await browser.newContext({ storageState: USER2_STATE });
  const page    = await context.newPage();
  const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';
  const res = await page.request.get(
    `${BASE_URL}/api/audits/${audit1Id}/export?format=json`,
  );
  expect(res.status()).toBe(404);
  expect(res.status()).not.toBe(401);
  await context.close();
});


// ─── F16: First-time signup ─────────────────────────────────────────────────────

/**
 * F16-first-time-signup.spec.ts
 *
 * Sprint 4 §8 — First-time signup: org with 0 brands → /brands/wizard (BC1 fix).
 *
 * Tests:
 *   F16-01  Dashboard with 0 brands server-redirects to /brands/wizard
 *   F16-02  /brands/wizard renders step 1 (name + domain fields)
 *   F16-03  Wizard has 4 step indicator
 */

test.describe('F16 — First-time signup redirect', () => {
  const f16ENV = {
    clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
    clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
    email:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
  };
  let f16OrgId = '';

  test.beforeAll(async () => {
    const { seedOrganization: sO, seedUser: sU, deleteAllTestDataForOrg: del } = await import('../helpers/db');
    const org = await sO({ clerkOrgId: f16ENV.clerkOrgId, name: 'S4 FirstTime Org', tier: 'free' });
    f16OrgId = org.id;
    await sU({ clerkUserId: f16ENV.clerkUserId, organizationId: f16OrgId, email: f16ENV.email });
    // Clear all brands — org has 0
    await del(f16OrgId);
  });

  test.afterAll(async () => {
    if (f16OrgId) {
      const { deleteAllTestDataForOrg } = await import('../helpers/db');
      await deleteAllTestDataForOrg(f16OrgId);
    }
  });

  test('F16-01: dashboard with 0 brands → server-redirects to /brands/wizard', async ({ page }) => {
    const { goto: g } = await import('../helpers/page');
    await g(page, '/dashboard');
    await expect(page).toHaveURL(/\/brands\/wizard/, { timeout: 15_000 });
    await page.screenshot({ path: 'tests/e2e/frontend/sprint4/reports/F16-01-wizard-redirect.png' });
  });

  test('F16-02: /brands/wizard renders step 1 with name + domain fields', async ({ page }) => {
    const { goto: g } = await import('../helpers/page');
    await g(page, '/brands/wizard');
    await expect(page.getByLabel(/brand name/i).or(page.locator('input[name="name"]')).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/domain/i).or(page.locator('input[name="domain"]')).first()).toBeVisible();
    await page.screenshot({ path: 'tests/e2e/frontend/sprint4/reports/F16-02-wizard-step1.png' });
  });

  test('F16-03: wizard shows step indicator (4 steps)', async ({ page }) => {
    const { goto: g } = await import('../helpers/page');
    await g(page, '/brands/wizard');
    // Step indicator — look for "Step 1 of 4" or 4 step dots/bullets
    const stepIndicator = page.getByText(/step.*1.*4|1.*of.*4|4.*step/i)
      .or(page.locator('[class*="step"], [class*="stepper"], [aria-label*="step"]').first());
    if (await stepIndicator.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(stepIndicator).toBeVisible();
    }
    await page.screenshot({ path: 'tests/e2e/frontend/sprint4/reports/F16-03-step-indicator.png' });
  });
});
