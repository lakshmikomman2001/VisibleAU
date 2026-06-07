/**
 * 06-filters.spec.ts
 *
 * Sprint 6 §10 (DC5) — Filter bar: brand filter, dimension filter,
 * filters use URL searchParams (bookmarkable, survives refresh).
 */
import { testAsUser1, expect } from './fixtures';
import {
  seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItem, deleteTestDataForOrg,
} from './db';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};

let org1Id   = '';
let brand1Id = '';
let brand2Id = '';
let audit1Id = '';
let audit2Id = '';

testAsUser1.beforeAll(async () => {
  const org   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-FE] Filters Org', tier: 'starter' });
  org1Id      = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });

  // Two brands — for brand filter test
  const brand1 = await seedBrand({ organizationId: org1Id, name: '[S6-FE] Filter Brand Alpha' });
  const brand2 = await seedBrand({ organizationId: org1Id, name: '[S6-FE] Filter Brand Beta' });
  brand1Id = brand1.id;
  brand2Id = brand2.id;

  const audit1 = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  const audit2 = await seedAudit({ organizationId: org1Id, brandId: brand2Id });
  audit1Id = audit1.id;
  audit2Id = audit2.id;

  // Brand1 items: frequency + accuracy dimensions
  await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'wikipedia-article', dimension: 'frequency',
    title: '[S6-FE] Alpha frequency item', action: 'Draft Wikipedia article.',
    confidenceLabel: 'confirmed', expectedImpactScore: 'high',
  });
  await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'stale-content', dimension: 'accuracy',
    title: '[S6-FE] Alpha accuracy item', action: 'Update stale content.',
    confidenceLabel: 'confirmed', expectedImpactScore: 'high',
  });

  // Brand2 items: context dimension only
  await seedActionItem({
    organizationId: org1Id, brandId: brand2Id, auditId: audit2Id,
    recommendationKey: 'faq-content', dimension: 'context',
    title: '[S6-FE] Beta context item', action: 'Add FAQ schema.',
    confidenceLabel: 'likely', expectedImpactScore: 'medium',
  });
});

testAsUser1.afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
});

// ─── FE-S6-41 — Default view shows all brands ────────────────────────────────

testAsUser1('FE-S6-41: default Action Center shows all brands items', async ({ page }) => {
  await page.goto('/action-center');
  await expect(page.getByText('[S6-FE] Alpha frequency item')).toBeVisible();
  await expect(page.getByText('[S6-FE] Beta context item')).toBeVisible();
});

// ─── FE-S6-42 — Brand filter shows only selected brand ───────────────────────

testAsUser1('FE-S6-42: brand filter shows only items for selected brand (DC5 fix)', async ({ page }) => {
  await page.goto(`/action-center?brandId=${brand1Id}`);
  await expect(page.getByText('[S6-FE] Alpha frequency item')).toBeVisible();
  await expect(page.getByText('[S6-FE] Alpha accuracy item')).toBeVisible();
  // Brand2 items excluded
  await expect(page.getByText('[S6-FE] Beta context item')).not.toBeVisible();
});

// ─── FE-S6-43 — Dimension filter shows only that dimension ───────────────────

testAsUser1('FE-S6-43: dimension filter shows only items for selected dimension', async ({ page }) => {
  await page.goto('/action-center?dimension=frequency');
  await expect(page.getByText('[S6-FE] Alpha frequency item')).toBeVisible();
  // Accuracy and context items not shown
  await expect(page.getByText('[S6-FE] Alpha accuracy item')).not.toBeVisible();
  await expect(page.getByText('[S6-FE] Beta context item')).not.toBeVisible();
});

// ─── FE-S6-44 — Filter persists after page reload ────────────────────────────

testAsUser1('FE-S6-44: brand filter in URL persists after page reload (DC5 bookmarkable)', async ({ page }) => {
  await page.goto(`/action-center?brandId=${brand2Id}`);
  await expect(page.getByText('[S6-FE] Beta context item')).toBeVisible();
  // Reload the page
  await page.reload();
  // Filter should still be applied
  await expect(page).toHaveURL(new RegExp(`brandId=${brand2Id}`));
  await expect(page.getByText('[S6-FE] Beta context item')).toBeVisible();
  await expect(page.getByText('[S6-FE] Alpha frequency item')).not.toBeVisible();
});

// ─── FE-S6-45 — Combined brand + dimension filter ────────────────────────────

testAsUser1('FE-S6-45: combined brand + dimension filter narrows to single result', async ({ page }) => {
  await page.goto(`/action-center?brandId=${brand1Id}&dimension=accuracy`);
  await expect(page.getByText('[S6-FE] Alpha accuracy item')).toBeVisible();
  await expect(page.getByText('[S6-FE] Alpha frequency item')).not.toBeVisible();
  await expect(page.getByText('[S6-FE] Beta context item')).not.toBeVisible();
});

// ─── FE-S6-46 — UI filter control updates URL ────────────────────────────────

testAsUser1('FE-S6-46: selecting brand in filter UI updates URL searchParams (DC5)', async ({ page }) => {
  await page.goto('/action-center');
  // Open brand filter control and select Brand Alpha
  const brandPicker = page.getByRole('combobox', { name: /brand/i });
  await brandPicker.click();
  await page.getByRole('option', { name: '[S6-FE] Filter Brand Alpha' }).click();
  // URL should now include brandId
  await expect(page).toHaveURL(new RegExp(`brandId=${brand1Id}`));
});

// ─── FE-S6-47 — Dimension filter control updates URL ─────────────────────────

testAsUser1('FE-S6-47: selecting dimension in filter UI updates URL searchParams', async ({ page }) => {
  await page.goto('/action-center');
  const dimensionFilter = page.getByRole('combobox', { name: /dimension/i });
  await dimensionFilter.click();
  await page.getByRole('option', { name: 'Frequency' }).click();
  await expect(page).toHaveURL(/dimension=frequency/);
});
