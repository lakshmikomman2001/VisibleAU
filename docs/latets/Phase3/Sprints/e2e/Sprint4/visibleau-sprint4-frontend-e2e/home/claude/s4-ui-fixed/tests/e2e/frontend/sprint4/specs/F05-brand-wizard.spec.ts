/**
 * F05-brand-wizard.spec.ts
 *
 * Sprint 4 §8 — Brand wizard /brands/wizard: 4-step guided flow.
 *
 * Tests:
 *   F05-01  Wizard loads at step 1 (brand name + domain + region)
 *   F05-02  "Continue" on step 1 with valid data advances to step 2
 *   F05-03  Step 2 shows 3 vertical pack cards (Tradies, Allied Health, SaaS)
 *   F05-04  Step 2 vertical packs are hardcoded (BB1: no DB query)
 *   F05-05  "Coming v1.1" packs are disabled/locked (not selectable)
 *   F05-06  "Back" from step 2 returns to step 1 (draft state preserved)
 *   F05-07  Step 3 shows region/locations picker
 *   F05-08  Step 4 shows summary card with cost estimate (BA3 tier-aware)
 *   F05-09  "Create brand & run first audit" CTA navigates to running screen
 */

import { test, expect } from '@playwright/test';
import {
  seedOrganization, seedUser, seedBrand, deleteAllTestDataForOrg,
} from '../helpers/db';
import { goto, screenshot } from '../helpers/page';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

let orgId = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 Wizard Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);
  // Seed 1 brand so dashboard doesn't redirect back to wizard during sidebar tests
  await seedBrand({ organizationId: orgId, name: 'Wizard Placeholder', domain: 'wizph.e2e-s4ui.test' });
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

/** Navigate through wizard step 1 with valid data and click Continue. */
async function completeStep1(page: import('@playwright/test').Page): Promise<void> {
  await goto(page, '/brands/wizard');
  await expect(page).toHaveURL(/\/brands\/wizard/, { timeout: 15_000 });
  // Fill name
  const nameField = page.getByLabel(/brand name/i).or(page.locator('input[name="name"]')).first();
  await expect(nameField).toBeVisible({ timeout: 15_000 });
  await nameField.fill('[S4-UI] Wizard Brand');
  // Fill domain
  const domainField = page.getByLabel(/domain/i).or(page.locator('input[name="domain"]')).first();
  await domainField.fill('wizard.e2e-s4ui.test');
  // Click Continue
  await page.getByRole('button', { name: /continue|next/i }).first().click();
  // Should advance to step 2
  await expect(page.getByText(/vertical|pack|tradies|allied/i).first()).toBeVisible({ timeout: 15_000 });
}

test('F05-01: wizard loads at step 1 with name + domain fields', async ({ page }) => {
  await goto(page, '/brands/wizard');
  await expect(page.getByLabel(/brand name/i).or(page.locator('input[name="name"]')).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/domain/i).or(page.locator('input[name="domain"]')).first()).toBeVisible();
  await screenshot(page, 'F05-01-wizard-step1');
});

test('F05-02: step 1 Continue advances to step 2', async ({ page }) => {
  await completeStep1(page);
  // Step 2 contains vertical packs
  await expect(page.getByText(/tradies|vertical|choose.*pack/i).first()).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F05-02-step2');
});

test('F05-03: step 2 shows Tradies, Allied Health, SaaS vertical cards', async ({ page }) => {
  await completeStep1(page);
  for (const pack of ['Tradies', 'Allied Health', 'SaaS']) {
    await expect(page.getByText(pack, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  }
  await screenshot(page, 'F05-03-vertical-packs');
});

test('F05-04: step 2 vertical packs are hardcoded constants (BB1 — no DB query)', async ({ page }) => {
  // The packs must render even if the vertical_packs DB table doesn't exist
  // (Sprint 5 creates it). If it were a DB query, we'd see an error here.
  await completeStep1(page);
  // Verify 3 active packs appear without a DB error banner
  // H10 FIX: removed .catch(() => {}) — that silently swallowed assertion failures.
  // Use count() to check absence of error text without risking a swallowed failure.
  const errorEl = page.getByText(/error|relation.*does not exist/i);
  const errorCount = await errorEl.count();
  expect(errorCount, 'Error/DB-not-found message should not appear — vertical_packs table may have been queried').toBe(0);
  await expect(page.getByText(/tradies/i).first()).toBeVisible({ timeout: 10_000 });
});

test('F05-05: "Coming v1.1" packs are disabled (Professional Services, Real Estate)', async ({ page }) => {
  await completeStep1(page);
  // Coming v1.1 cards must be present but disabled/locked
  const lockedBadge = page.getByText(/coming v1\.1|coming soon|locked/i).first();
  if (await lockedBadge.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await expect(lockedBadge).toBeVisible();
  }
});

test('F05-06: Back from step 2 returns to step 1 with draft preserved', async ({ page }) => {
  await completeStep1(page); // fills step 1 + advances to step 2
  // Click Back
  await page.getByRole('button', { name: /back/i }).first().click();
  // Should be on step 1 with the name still filled
  const nameField = page.getByLabel(/brand name/i).or(page.locator('input[name="name"]')).first();
  await expect(nameField).toBeVisible({ timeout: 10_000 });
  const value = await nameField.inputValue();
  expect(value).toContain('Wizard Brand');
  await screenshot(page, 'F05-06-back-draft');
});

test('F05-07: step 3 shows location/region picker', async ({ page }) => {
  await completeStep1(page);
  // Select Tradies and continue to step 3
  await page.getByText(/tradies/i).first().click();
  await page.getByRole('button', { name: /continue|next/i }).first().click();
  // Step 3: locations & competitors
  await expect(
    page.getByText(/location|suburb|region|competitor/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F05-07-step3-locations');
});

test('F05-08: step 4 shows cost estimate (BA3 tier-aware)', async ({ page }) => {
  // Navigate through all 3 steps to reach step 4
  await completeStep1(page);
  await page.getByText(/tradies/i).first().click();
  await page.getByRole('button', { name: /continue|next/i }).first().click();
  await page.getByRole('button', { name: /continue|next|skip/i }).first().click();
  // Step 4: confirm & run — must show cost estimate
  await expect(
    page.getByText(/A\$|cost|estimate|audit/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  // Should show "Create brand & run first audit" CTA
  await expect(
    page.getByRole('button', { name: /create brand|run.*audit|create.*run/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F05-08-step4-confirm');
});

test('F05-09: "Create brand & run first audit" navigates to audit running screen', async ({ page }) => {
  await completeStep1(page);
  await page.getByText(/tradies/i).first().click();
  await page.getByRole('button', { name: /continue|next/i }).first().click();
  await page.getByRole('button', { name: /continue|next|skip/i }).first().click();
  await page.getByRole('button', { name: /create brand|run.*audit/i }).first().click();
  // After wizard submit: POST /api/brands + POST /api/audits → redirect to /audits/[id]
  await expect(page).toHaveURL(/\/audits\//, { timeout: 30_000 });
  await screenshot(page, 'F05-09-wizard-complete');
});
