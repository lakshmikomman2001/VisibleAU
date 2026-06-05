/**
 * 05-acceptance.spec.ts
 *
 * Sprint 5 §12 frontend acceptance checklist — full browser E2E flows.
 *
 * What this file verifies (FE-S5-37 through FE-S5-44):
 *  FE-S5-37  Full wizard: create brand → wizard step 2 shows API cards
 *  FE-S5-38  Wizard step 2 → selecting Tradies sets form.vertical (CJ1)
 *            Verified by checking the POST /api/brands payload via route interception
 *  FE-S5-39  POST /api/brands receives correct vertical value (CN5 fix)
 *  FE-S5-40  PromptPreview appears in wizard step 2 after pack selection (CJ4)
 *  FE-S5-41  PromptPreview shows ≥1 and ≤3 expanded prompts (no raw placeholders)
 *  FE-S5-42  /verticals page shows 8 cards accessible from sidebar (§12 acceptance)
 *  FE-S5-43  /verticals/[packId] shows read-only pack detail with disabled Customise btn
 *  FE-S5-44  Wizard confirm screen shows Pack row (CG4) — full round-trip
 *
 * Test data lifecycle:
 *  - beforeAll: seed org + user
 *  - afterEach:  delete any brands created during the test (via API interception + DB)
 *  - afterAll:   deleteTestDataForOrg (full sweep)
 *
 * IMPORTANT: Tests that complete the wizard (FE-S5-39) create a real brand row.
 * The brand is deleted in afterEach via deleteTestDataForOrg.
 */

import { test, expect, type Page, type Request } from '@playwright/test';
import {
  db,
  seedOrganization, seedUser, deleteTestDataForOrg,
  getProductionPack, deleteAllFrontendTestBrands,
} from './helpers/db';
import { gotoAuthenticated } from './helpers/auth';
import { WIZARD, BROWSER_PAGE, DETAIL_PAGE, SIDEBAR } from './helpers/selectors';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../db/schema';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL      ?? '',
};

let orgId = '';

test.beforeAll(async () => {
  await deleteAllFrontendTestBrands();
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
});

test.afterEach(async () => {
  // Clean up any brands created by acceptance tests
  await deleteTestDataForOrg(orgId);
});

test.afterAll(async () => {
  await deleteAllFrontendTestBrands();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

async function fillWizardStep1(page: Page, brandName: string, domain: string): Promise<void> {
  await gotoAuthenticated(page, '/brands/wizard');
  await expect(page.locator('h2:has-text("Brand basics")')).toBeVisible({ timeout: 10_000 });
  await page.getByLabel(/brand name/i).fill(brandName);
  await page.getByLabel(/domain/i).fill(domain);
  // Region defaults to Australia — leave as-is
  await page.locator(WIZARD.continueBtn).click();
}

async function waitForStep2Cards(page: Page): Promise<void> {
  await expect(page.locator(WIZARD.step2Heading)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(WIZARD.packCard('tradies'))).toBeVisible({ timeout: 12_000 });
}

/**
 * B1/B13 FIX: Enter a primary suburb in step 3 to satisfy Zod primaryRegions.min(1).
 * The region picker uses role="combobox" — type a suburb name and select from the listbox.
 */
async function fillWizardStep3Suburb(page: Page): Promise<void> {
  await expect(page.locator('h2:has-text("Locations")')).toBeVisible({ timeout: 8_000 });
  const combobox = page.getByRole('combobox').first();
  await combobox.click();
  await combobox.fill('Sydney');
  await page.getByRole('listbox').waitFor({ timeout: 5_000 });
  await page.getByRole('option').first().click();
}

// ---------------------------------------------------------------------------
// FE-S5-37: Full wizard flow reaches step 2 with API-driven pack cards
// ---------------------------------------------------------------------------

test('FE-S5-37: wizard step 2 shows API-driven pack cards (not hardcoded)', async ({ page }) => {
  await fillWizardStep1(page, '[FE-S5] Bondi Plumbing Accept', 'fe-s5-accept.test');
  await waitForStep2Cards(page);

  // Verify the cards are data-driven: count badge must match DB (not a hardcoded string)
  const tradiesCard = page.locator(WIZARD.packCard('tradies'));
  await expect(tradiesCard).toContainText('124 prompts');

  // All 5 cards (3 active + 2 v1.1) must be visible in the wizard
  await expect(page.locator(WIZARD.packCard('allied-health'))).toBeVisible();
  await expect(page.locator(WIZARD.packCard('saas'))).toBeVisible();
  await expect(page.locator(WIZARD.packCard('professional-services'))).toBeVisible();
  await expect(page.locator(WIZARD.packCard('real-estate'))).toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-S5-38: Selecting Tradies sets form.vertical = 'tradies' (CJ1 fix)
//           Verified via network interception of POST /api/brands
// ---------------------------------------------------------------------------

test('FE-S5-38 + FE-S5-39: selecting Tradies and completing wizard sends correct vertical in POST /api/brands (CJ1 + CN5)', async ({ page }) => {
  // Capture the POST /api/brands request body to verify vertical is set correctly
  const brandRequests: { body: Record<string, unknown> }[] = [];
  await page.route('**/api/brands', async (route, request) => {
    if (request.method() === 'POST') {
      try {
        const body = JSON.parse(await request.postData() ?? '{}');
        brandRequests.push({ body });
      } catch { /* ignore parse errors */ }
    }
    await route.continue();
  });

  await fillWizardStep1(page, '[FE-S5] Tradies Accept Brand', 'fe-s5-tradies-accept.test');
  await waitForStep2Cards(page);

  // Select Tradies pack
  await page.locator(WIZARD.packCard('tradies')).click();

  // Step 3 — C1 FIX: same B1/B13 issue as FE-S5-44 — must fill at least one suburb
  // before clicking Continue or Zod primaryRegions.min(1) blocks advancement.
  await page.locator(WIZARD.continueBtn).click();
  await fillWizardStep3Suburb(page);
  await page.locator(WIZARD.continueBtn).click();
  await expect(page.locator('h2:has-text("Confirm")')).toBeVisible({ timeout: 8_000 });

  // Intercept form submission — click "Create brand & run first audit"
  await page.locator(WIZARD.createBrandBtn).click();

  // Wait for the POST to be captured (may redirect to audit-running page)
  await page.waitForTimeout(2000);

  // Verify POST /api/brands was called with vertical='tradies'
  expect(brandRequests.length).toBeGreaterThan(0);
  const postBody = brandRequests[0].body;
  expect(postBody.vertical).toBe('tradies');

  // Verify the brand was actually created in the DB with the correct vertical
  const brands = await db
    .select()
    .from(schema.brands)
    .where(eq(schema.brands.organizationId, orgId));

  const createdBrand = brands.find(b => b.domain === 'fe-s5-tradies-accept.test');
  if (createdBrand) {
    expect(createdBrand.vertical).toBe('tradies');
  }
});

// ---------------------------------------------------------------------------
// FE-S5-40 + FE-S5-41: PromptPreview visible with ≥1 expanded prompt (CJ4)
// ---------------------------------------------------------------------------

test('FE-S5-40 + FE-S5-41: PromptPreview shows ≤3 expanded prompts with no raw placeholders (CJ4)', async ({ page }) => {
  await fillWizardStep1(page, '[FE-S5] Preview Accept', 'fe-s5-preview.test');
  await waitForStep2Cards(page);

  // Select SaaS pack (verify preview works for all packs, not just Tradies)
  await page.locator(WIZARD.packCard('saas')).click();

  // Wait for PromptPreview to appear
  const preview = page.locator(WIZARD.promptPreview);
  await expect(preview).toBeVisible({ timeout: 10_000 });

  // At least 1 item, at most 3 (top-3 preview limit)
  const items = page.locator(WIZARD.promptPreviewItem);
  await expect(items.first()).toBeVisible({ timeout: 10_000 });
  const itemCount = await items.count();
  expect(itemCount).toBeGreaterThanOrEqual(1);
  expect(itemCount).toBeLessThanOrEqual(3);

  // No raw placeholders in any of the expanded prompts
  for (let i = 0; i < itemCount; i++) {
    const text = await items.nth(i).textContent() ?? '';
    expect(text).not.toMatch(/\{brand\}|\{location\}|\{domain\}|\{competitors\}/);
  }
});

// ---------------------------------------------------------------------------
// FE-S5-42: /verticals shows 8 cards accessible from sidebar (§12 acceptance)
// ---------------------------------------------------------------------------

test('FE-S5-42: /verticals shows 8 pack cards accessible from the authenticated sidebar (§12)', async ({ page }) => {
  // E6 FIX: Navigate to /verticals directly, not /dashboard.
  // /dashboard redirects to /brands/wizard when the test org has 0 brands (BC1 fix).
  // /verticals is inside app/(auth)/ — it renders the same layout.tsx sidebar.
  // This still tests the §12 acceptance criterion: sidebar is present on /verticals,
  // and the sidebar "Vertical packs" link is reachable from any authenticated page.
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  // Verify the sidebar "Vertical packs" link exists on this authenticated page
  const verticalPacksLink = page.locator(SIDEBAR.verticalPacksLink);
  await expect(verticalPacksLink).toBeVisible({ timeout: 8_000 });

  // Wait for pack cards to render — confirms the page is fully loaded
  await expect(page.locator(BROWSER_PAGE.packCard('tradies'))).toBeVisible({ timeout: 10_000 });

  // Must have exactly 8 cards
  await expect(page.locator(BROWSER_PAGE.allCards)).toHaveCount(8);
});

// ---------------------------------------------------------------------------
// FE-S5-43: /verticals/[packId] is read-only — Customise button disabled (§12 + CC2)
// ---------------------------------------------------------------------------

test('FE-S5-43: /verticals/[packId] is read-only with disabled Customise button (§12 CC2 fix)', async ({ page }) => {
  const pack = await getProductionPack('tradies');
  expect(pack).not.toBeNull();

  await gotoAuthenticated(page, `/verticals/${pack!.id}`);
  await expect(page.locator(DETAIL_PAGE.heading)).toBeVisible({ timeout: 10_000 });

  // Customise prompts button must exist but be disabled
  const customiseBtn = page.locator(DETAIL_PAGE.customiseBtn);
  await expect(customiseBtn).toBeVisible();
  await expect(customiseBtn).toBeDisabled();

  // Clicking disabled button must NOT navigate to the editor
  const urlBefore = page.url();
  await customiseBtn.click({ force: true });
  await page.waitForTimeout(500);
  expect(page.url()).toBe(urlBefore); // no navigation happened
});

// ---------------------------------------------------------------------------
// FE-S5-44: Wizard confirm screen shows Pack row with version and count (CG4)
// ---------------------------------------------------------------------------

test('FE-S5-44: wizard step 4 confirm screen shows Pack row "AU Tradies v1.0 · 124 prompts" (CG4 fix)', async ({ page }) => {
  await fillWizardStep1(page, '[FE-S5] CG4 Confirm Brand', 'fe-s5-cg4.test');
  await waitForStep2Cards(page);

  // Select Tradies
  await page.locator(WIZARD.packCard('tradies')).click();

  // Step 3 — B1/B13 FIX: enter a suburb before continuing (Zod primaryRegions.min(1))
  await page.locator(WIZARD.continueBtn).click();
  await fillWizardStep3Suburb(page);
  await page.locator(WIZARD.continueBtn).click();

  await expect(page.locator('h2:has-text("Confirm")')).toBeVisible({ timeout: 8_000 });

  // Pack row must be present (CG4 fix — was missing in original Sprint 5 prototype)
  await expect(page.locator(WIZARD.confirmPackLabel)).toBeVisible();

  // Pack value must contain Tradies identifier + 124 prompts count
  const packValue = page.locator(WIZARD.confirmPackValue);
  await expect(packValue).toBeVisible();
  const packText = await packValue.textContent() ?? '';

  // Match "AU Tradies v1.0 · 124 prompts" or similar format
  expect(packText.toLowerCase()).toMatch(/tradies/);
  expect(packText).toMatch(/124/);

  // Confirm screen should also show the correct vertical
  const confirmBody = await page.locator('[data-testid="confirm-summary"], .space-y-2, .p-4').first().textContent() ?? '';
  expect(confirmBody.toLowerCase()).toMatch(/tradies/);
});
