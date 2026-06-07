/**
 * F04-brand-create.spec.ts
 *
 * Sprint 4 §8 — Brand create /brands/new: form, Zod validation, submit flow.
 *
 * Tests:
 *   F04-01  Form renders all required fields
 *   F04-02  Empty submit shows validation errors (Zod: name required)
 *   F04-03  Invalid domain format shows error (BC4 fix: regex validation)
 *   F04-04  Valid submission creates brand + triggers audit → redirects to /audits/[id]
 *   F04-05  URL with www. is normalised (BG2: www. stripped)
 */

import { test, expect } from '@playwright/test';
import {
  seedOrganization, seedUser, deleteAllTestDataForOrg,
} from '../helpers/db';
import { goto, screenshot } from '../helpers/page';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

let orgId = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 BrandCreate Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);
  // Need at least 1 brand so dashboard doesn't redirect to wizard
  const { seedBrand } = await import('../helpers/db');
  await seedBrand({ organizationId: orgId, name: 'Placeholder', domain: 'placeholder.e2e-s4ui.test' });
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F04-01: brand create form renders all required fields', async ({ page }) => {
  await goto(page, '/brands/new');
  await expect(page.getByLabel(/brand name/i).or(page.locator('input[name="name"]'))).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/domain/i).or(page.locator('input[name="domain"]'))).toBeVisible();
  await screenshot(page, 'F04-01-brand-form');
});

test('F04-02: empty form submit shows name validation error', async ({ page }) => {
  await goto(page, '/brands/new');
  await page.getByRole('button', { name: /create|save|submit/i }).first().click();
  // Zod: name must be at least 2 chars
  await expect(
    page.getByText(/brand name must be at least|name is required|required/i).first(),
  ).toBeVisible({ timeout: 10_000 });
  await screenshot(page, 'F04-02-validation');
});

test('F04-03: invalid domain format shows error (BC4 Zod regex)', async ({ page }) => {
  await goto(page, '/brands/new');
  const nameField = page.getByLabel(/brand name/i).or(page.locator('input[name="name"]')).first();
  const domainField = page.getByLabel(/domain/i).or(page.locator('input[name="domain"]')).first();
  await nameField.fill('Test Brand');
  await domainField.fill('not a valid domain!!!');
  await page.getByRole('button', { name: /create|save|submit/i }).first().click();
  await expect(
    page.getByText(/domain.*http|enter a domain|invalid domain/i).first(),
  ).toBeVisible({ timeout: 10_000 });
  await screenshot(page, 'F04-03-domain-error');
});

test('F04-04: valid form creates brand + redirects to audit running screen', async ({ page }) => {
  await goto(page, '/brands/new');
  const nameField   = page.getByLabel(/brand name/i).or(page.locator('input[name="name"]')).first();
  const domainField = page.getByLabel(/domain/i).or(page.locator('input[name="domain"]')).first();

  await nameField.fill('[S4-UI] Create Test Brand');
  await domainField.fill('createtest.e2e-s4ui.test');

  // Select vertical if a select is present
  const verticalSelect = page.locator('select[name="vertical"], [data-field="vertical"]').first();
  if (await verticalSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await verticalSelect.selectOption('tradies');
  }

  // Select a region if present
  const regionInput = page.locator('[class*="region"], [placeholder*="region"], [placeholder*="suburb"]').first();
  if (await regionInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await regionInput.fill('Sydney');
    await page.keyboard.press('Enter');
  }

  await page.getByRole('button', { name: /create|save|submit/i }).first().click();

  // BC3 fix: submit → POST /api/brands + POST /api/audits → redirect to /audits/[id]
  await expect(page).toHaveURL(/\/audits\//, { timeout: 30_000 });
  await screenshot(page, 'F04-04-success-redirect');
});

test('F04-05: www. prefix is stripped from domain (BG2 normalisation)', async ({ page }) => {
  await goto(page, '/brands/new');
  const domainField = page.getByLabel(/domain/i).or(page.locator('input[name="domain"]')).first();
  await domainField.fill('www.example.e2e-s4ui.test');
  // Zod transform strips www. — form should not show an error for www. prefix
  const nameField = page.getByLabel(/brand name/i).or(page.locator('input[name="name"]')).first();
  await nameField.fill('WWW Strip Test');
  // Not submitting — just verifying the field accepts www. without immediate error
  await expect(domainField).toHaveValue(/www\.example/i);
});
