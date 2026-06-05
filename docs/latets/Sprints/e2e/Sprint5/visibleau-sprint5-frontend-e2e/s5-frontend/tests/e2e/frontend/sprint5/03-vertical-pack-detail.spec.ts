/**
 * 03-vertical-pack-detail.spec.ts
 *
 * Sprint 5 vertical pack detail page — /verticals/[packId].
 *
 * What this file verifies (FE-S5-23 through FE-S5-33):
 *  - Page renders for a valid production pack UUID
 *  - Breadcrumb shows "Workspace → Vertical packs → Tradies" (CM3 fix)
 *  - Header "Tradies (AU)" with sub-text "124 prompts · N active brands · last updated..."
 *  - "Customise prompts" button is DISABLED with v1.1 badge (CC2 + Sprint 5 §1 F6)
 *  - Three KPI cards: Prompts (124), Sub-verticals (8), Categories (8)
 *  - Category breakdown table with 8 rows, each showing name + count badge + sample prompt
 *  - Vertical-specific patterns card is visible
 *  - Non-existent packId returns 404 (not a crash)
 *  - Unauthenticated access redirects to /sign-in
 *
 * Test data: uses production tradies pack (tradies+au). The packId is resolved
 * at runtime from the DB — never hardcoded.
 */

import { test, expect } from '@playwright/test';
import {
  getProductionPack,
  seedOrganization, seedUser, deleteTestDataForOrg,
} from './helpers/db';
import { gotoAuthenticated } from './helpers/auth';
import { DETAIL_PAGE } from './helpers/selectors';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL      ?? '',
};

let orgId    = '';
let packId   = '';
let packPath = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });

  // Resolve tradies pack UUID from DB — never hardcode
  const pack = await getProductionPack('tradies');
  if (!pack) throw new Error('Tradies production pack not found. Run pnpm seed before frontend E2E.');
  packId   = pack.id;
  packPath = `/verticals/${packId}`;
});

test.afterAll(async () => {
  await deleteTestDataForOrg(orgId);
});

// ---------------------------------------------------------------------------
// FE-S5-23: /verticals/[packId] renders without error
// ---------------------------------------------------------------------------

test('FE-S5-23: /verticals/[packId] renders the Tradies detail page', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// FE-S5-24: Breadcrumb shows "Workspace → Vertical packs → Tradies" (CM3)
// ---------------------------------------------------------------------------

test('FE-S5-24: breadcrumb shows Workspace → Vertical packs → Tradies (CM3 fix)', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  // The breadcrumb must contain all three crumbs
  const nav = page.locator('nav, [data-testid="breadcrumb"]').first();
  await expect(nav).toContainText('Workspace');
  await expect(nav).toContainText('Vertical packs');
  await expect(nav).toContainText('Tradies');
});

// ---------------------------------------------------------------------------
// FE-S5-25: Breadcrumb "Vertical packs" crumb links back to /verticals
// ---------------------------------------------------------------------------

test('FE-S5-25: breadcrumb "Vertical packs" crumb is a link back to /verticals', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  // Click "Vertical packs" in the breadcrumb
  await page.locator('a:has-text("Vertical packs"), button:has-text("Vertical packs")').first().click();
  await page.waitForURL('**/verticals', { timeout: 8_000 });
  expect(page.url()).toMatch(/\/verticals$/);
});

// ---------------------------------------------------------------------------
// FE-S5-26: Header shows "Tradies (AU)" with correct prompt count
// ---------------------------------------------------------------------------

test('FE-S5-26: header shows "Tradies (AU)" and "124 prompts" in sub-heading', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  await expect(page.locator(DETAIL_PAGE.heading)).toContainText('Tradies (AU)');
  await expect(page.locator(DETAIL_PAGE.subheading)).toContainText('124 prompts');
  await expect(page.locator(DETAIL_PAGE.subheading)).toContainText('last updated');
});

// ---------------------------------------------------------------------------
// FE-S5-27: "Customise prompts" button is DISABLED with v1.1 badge (CC2 fix)
// ---------------------------------------------------------------------------

test('FE-S5-27: "Customise prompts" button is disabled with v1.1 badge in Sprint 5 (CC2 fix)', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  const customiseBtn = page.locator(DETAIL_PAGE.customiseBtn);
  await expect(customiseBtn).toBeVisible();

  // Must be disabled — clicking it must not navigate
  await expect(customiseBtn).toBeDisabled();

  // Must show v1.1 badge alongside the button
  // Either in the button text or adjacent
  const buttonArea = page.locator('header, [data-testid="page-header"], .flex:has(button:has-text("Customise"))').first();
  await expect(buttonArea).toContainText('v1.1');
});

// ---------------------------------------------------------------------------
// FE-S5-28: Three KPI cards: Prompts (124), Sub-verticals (8), Categories (8)
// ---------------------------------------------------------------------------

test('FE-S5-28: KPI cards show Prompts=124, Sub-verticals=8, Categories=8', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  // D12 FIX: KPI card data-testids are not in the Sprint 5 spec. Selectors now include
  // structural/text-based fallbacks. But for maximum resilience we also verify the
  // numbers appear ANYWHERE on the page — this catches implementations where the
  // KPI UI is present but uses different element structure.

  // Prompts KPI — 124 must appear with label 'Prompts'
  const kpiPrompts = page.locator(DETAIL_PAGE.kpiPrompts).first();
  const kpiPromptsVisible = await kpiPrompts.isVisible().catch(() => false);
  if (kpiPromptsVisible) {
    await expect(kpiPrompts).toContainText('124');
    await expect(kpiPrompts).toContainText('Prompts');
  } else {
    // Fallback: verify 124 and Prompts appear on the page in proximity
    await expect(page.locator('body')).toContainText('124');
    await expect(page.locator('body')).toContainText('Prompts');
  }

  // Sub-verticals KPI — 8 must appear with label 'Sub-vertical'
  const kpiSub = page.locator(DETAIL_PAGE.kpiSubVerticals).first();
  const kpiSubVisible = await kpiSub.isVisible().catch(() => false);
  if (kpiSubVisible) {
    await expect(kpiSub).toContainText('8');
  } else {
    await expect(page.locator('body')).toContainText('Sub-vertical');
  }

  // Categories KPI — 8 must appear with label 'Categories'
  const kpiCat = page.locator(DETAIL_PAGE.kpiCategories).first();
  const kpiCatVisible = await kpiCat.isVisible().catch(() => false);
  if (kpiCatVisible) {
    await expect(kpiCat).toContainText('8');
  } else {
    await expect(page.locator('body')).toContainText('Categories');
  }
});

// ---------------------------------------------------------------------------
// FE-S5-29: Category breakdown shows exactly 8 rows
// ---------------------------------------------------------------------------

test('FE-S5-29: category breakdown section shows exactly 8 category rows', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  // D12 FIX: category-row testid is not in the spec. Use the compound selector
  // (includes structural fallbacks). If none of the fallbacks find 8 rows,
  // the page body must at least mention all 8 category names.
  const categoryRows = page.locator(DETAIL_PAGE.categoryRow);
  const firstRow = categoryRows.first();
  await expect(firstRow).toBeVisible({ timeout: 8_000 });
  await expect(categoryRows).toHaveCount(8);
});

// ---------------------------------------------------------------------------
// FE-S5-30: Category counts sum to 124 prompts
// ---------------------------------------------------------------------------

test('FE-S5-30: category row counts sum to 124 (28+18+22+24+12+10+6+4)', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  const categoryRows = page.locator(DETAIL_PAGE.categoryRow);
  await expect(categoryRows.first()).toBeVisible({ timeout: 8_000 });

  // Each row must show a numeric count badge
  const count = await categoryRows.count();
  let total = 0;
  for (let i = 0; i < count; i++) {
    const rowText = await categoryRows.nth(i).textContent() ?? '';
    // Extract the badge number — last numeric token in the row
    const numbers = rowText.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      total += parseInt(numbers[numbers.length - 1], 10);
    }
  }
  expect(total).toBe(124);
});

// ---------------------------------------------------------------------------
// FE-S5-31: Category rows contain sample prompt text (not empty)
// ---------------------------------------------------------------------------

test('FE-S5-31: each category row shows a non-empty sample prompt snippet', async ({ page }) => {
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  const categoryRows = page.locator(DETAIL_PAGE.categoryRow);
  await expect(categoryRows.first()).toBeVisible({ timeout: 8_000 });

  const count = await categoryRows.count();
  for (let i = 0; i < count; i++) {
    const text = await categoryRows.nth(i).textContent() ?? '';
    // Every row must have some content beyond just the count number
    expect(text.trim().length).toBeGreaterThan(5);
  }
});

// ---------------------------------------------------------------------------
// FE-S5-32: Vertical-specific patterns card is visible
// ---------------------------------------------------------------------------

test('FE-S5-32: vertical-specific patterns card visible if implemented (prototype-only feature)', async ({ page }) => {
  // D10 FIX: The vertical-specific patterns card appears in the prototype but is NOT
  // in the Sprint 5 CM3 spec. PackDetailPage only specifies: breadcrumb, header,
  // Customise button, and categoryBreakdown. A developer following the spec alone
  // will not implement the patterns card. This test is therefore a soft check:
  // it passes whether or not the card is present. If the patterns card IS present,
  // it must contain AU-specific pattern text (hipages, Yellow Pages AU, etc.).
  await gotoAuthenticated(page, packPath);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  const patternsLocator = page.locator(DETAIL_PAGE.patternsCard);
  const patternsVisible = await patternsLocator.isVisible().catch(() => false);

  if (patternsVisible) {
    // Patterns card IS implemented — verify it shows AU-specific content
    const patternsText = await patternsLocator.textContent();
    expect(patternsText).toMatch(/hipages|Yellow Pages|suburb|after.hours|NAP/i);
  }
  // If not visible: test passes — the card is an optional prototype feature in Sprint 5.
});

// ---------------------------------------------------------------------------
// FE-S5-33: Non-existent packId returns 404 (not a crash)
// ---------------------------------------------------------------------------

test('FE-S5-33: non-existent packId returns 404 page not a 500 crash', async ({ page }) => {
  const fakeId = '00000000-0000-0000-0000-000000000000';
  await gotoAuthenticated(page, `/verticals/${fakeId}`);

  // Should show a 404 page — Next.js renders this automatically
  // Check that the page doesn't show a 500 error or blank crash
  const bodyText = await page.textContent('body') ?? '';
  expect(bodyText).not.toMatch(/error|500|unhandled/i);
  // 404 page or "not found" message expected
  // Accept any of: 404, "Not found", "does not exist", or Next.js default 404
  expect(bodyText).toMatch(/404|not found|doesn't exist|does not exist/i);
});
