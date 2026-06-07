/**
 * 01-action-center-page.spec.ts
 *
 * Sprint 6 §10 + §13 — Action Center list page: navigation, header count,
 * dimension group sections render, sidebar link active state.
 */
// H3 FIX: testAsUser1 already extends @playwright/test base — no need to import
// the raw test/beforeAll/afterAll. Using testAsUser1.beforeAll/afterAll (authenticated
// hooks) is the correct pattern per Sprint 1 §10 Playwright fixture design.
// Importing bare 'test' is unused and causes TypeScript noUnusedLocals errors.
import { expect }      from '@playwright/test';
import { testAsUser1 } from './fixtures';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItemSuite, seedActionItem, deleteTestDataForOrg,
} from './db';
import * as schema from '../../../../db/schema';
import { eq }      from 'drizzle-orm';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};

let org1Id   = '';
let brand1Id = '';
let audit1Id = '';

// ─── Seed ─────────────────────────────────────────────────────────────────────

testAsUser1.beforeAll(async () => {
  const org   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-FE] Page Org1', tier: 'starter' });
  org1Id      = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand = await seedBrand({ organizationId: org1Id, name: '[S6-FE] Bondi Plumbing', vertical: 'tradies' });
  brand1Id    = brand.id;
  const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  audit1Id    = audit.id;
  // Seed 7 items across 4 dimensions (frequency × 3, position × 1, accuracy × 2, context × 1)
  await seedActionItemSuite({ organizationId: org1Id, brandId: brand1Id, auditId: audit1Id });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────

testAsUser1.afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
});

// ─── FE-S6-01 — Navigate to /action-center via sidebar ───────────────────────

testAsUser1('FE-S6-01: clicking Action Center in sidebar navigates to /action-center', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('a[href="/action-center"]');
  await expect(page).toHaveURL(/\/action-center$/);
  await expect(page.locator('h1')).toContainText('Action Center');
});

// ─── FE-S6-02 — Page heading and header count paragraph ──────────────────────

testAsUser1('FE-S6-02: page shows correct header count paragraph', async ({ page }) => {
  await page.goto('/action-center');
  await expect(page.locator('h1')).toContainText('Action Center');
  // Header: "X open recommendations across Y brands"
  const header = page.getByText(/open recommendation/i);
  await expect(header).toBeVisible();
  await expect(header).toContainText(/across \d+ brand/i);
});

// ─── FE-S6-03 — Dimension group sections render ───────────────────────────────

testAsUser1('FE-S6-03: dimension group sections render for seeded items (DF5 fix)', async ({ page }) => {
  await page.goto('/action-center');
  // seedActionItemSuite covers frequency, position, accuracy, context dimensions
  await expect(page.getByRole('heading', { name: 'Frequency', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Position', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accuracy', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Context', level: 2 })).toBeVisible();
  // Sentiment section NOT present (no seeded items in that dimension)
  await expect(page.getByRole('heading', { name: 'Sentiment', level: 2 })).not.toBeVisible();
});

// ─── FE-S6-04 — Recommendation cards visible in correct dimension ─────────────

testAsUser1('FE-S6-04: Wikipedia article card appears in Frequency section', async ({ page }) => {
  await page.goto('/action-center');
  // K7 FIX: dimension-group renders <h2>Frequency</h2> in a <div> per DF5 spec — not <section>.
  // Locate items near the Frequency heading using heading proximity.
  const frequencySection = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Frequency', level: 2 }) });
  await expect(frequencySection.getByText('[S6-FE] Wikipedia article')).toBeVisible();
  await expect(frequencySection.getByText('[S6-FE] Reddit absence')).toBeVisible();
  await expect(frequencySection.getByText('[S6-FE] Medium presence')).toBeVisible();
});

// ─── FE-S6-05 — Empty Sentiment section not rendered ─────────────────────────

testAsUser1('FE-S6-05: empty dimension sections are not rendered at all (DF5)', async ({ page }) => {
  await page.goto('/action-center');
  // Only 4 of 5 dimensions have items — Sentiment section must be absent
  const sectionHeadings = page.locator('h2');
  const texts = await sectionHeadings.allTextContents();
  expect(texts).not.toContain('Sentiment');
});

// ─── FE-S6-06 — Sidebar Action Center link is active ─────────────────────────

testAsUser1('FE-S6-06: sidebar Action Center link is active when on /action-center (DI2)', async ({ page }) => {
  await page.goto('/action-center');
  const sidebarLink = page.locator('a[href="/action-center"]');
  // Active link should have aria-current="page" or a visible active style class
  // The sidebar follows the same pattern as other nav items (Sprint 4 BK1/BK2)
  await expect(sidebarLink).toHaveAttribute('aria-current', 'page');
});

// ─── FE-S6-07 — No 'Sprint 6' badge on sidebar link ─────────────────────────

testAsUser1('FE-S6-07: Action Center sidebar link has no placeholder Sprint 6 badge (DI5)', async ({ page }) => {
  await page.goto('/dashboard');
  const sidebarLink = page.locator('a[href="/action-center"]');
  await expect(sidebarLink).not.toContainText('Sprint 6');
  await expect(sidebarLink).toContainText('Action Center');
});

// ─── FE-S6-08 — Page is accessible when signed in ────────────────────────────

testAsUser1('FE-S6-08: /action-center returns page content (not 404 or error)', async ({ page }) => {
  const response = await page.goto('/action-center');
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('Action Center');
});
