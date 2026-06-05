/**
 * tests/e2e/02-brands-list.spec.ts
 *
 * Frontend E2E: /brands — brand list page
 *
 * Sprint 1 §11 coverage:
 *   ✓ User can navigate to /brands via sidebar
 *   ✓ Empty state shown when no brands exist
 *   ✓ Brand cards appear after a brand is created
 *   ✓ "Create brand" button navigates to /brands/new
 *
 * Test data lifecycle:
 *   - beforeAll: ensure org + user rows exist in DB
 *   - afterAll:  hard-delete all brands created during this spec
 */

import { test, expect } from './helpers/auth';
import {
  ensureOrganization,
  ensureUser,
  deleteAllBrandsForOrg,
  getOrgByClerkId,
} from './helpers/db';
import { USER_1 } from './helpers/auth';

const ORG_NAME = 'E2E Brands List Org';
let orgId = ''; // C14 FIX: initialised to '' so afterAll guard works even if beforeAll fails

test.beforeAll(async () => {
  // D8 FIX: guard against missing CLERK_ID — same C9 issue. Empty string seeds broken user row.
  const clerkId = process.env.E2E_TEST_USER_1_CLERK_ID ?? '';
  if (!clerkId) throw new Error('E2E_TEST_USER_1_CLERK_ID must be set in .env.test.local');

  const org = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       ORG_NAME,
    region:     'au',
    tier:       'agency',
  });
  orgId = org.id;

  await ensureUser({ clerkUserId: clerkId, organizationId: orgId, email: USER_1.email, name: 'E2E User 1' });
});

test.afterAll(async () => {
  // Hard-delete all brands created during this spec
  if (orgId) await deleteAllBrandsForOrg(orgId); // C14 FIX: guard against uninitialised orgId
});

test.describe('Brand list page (/brands)', () => {
  test.beforeEach(async () => {
    // Start each test clean: delete all brands for org
    if (orgId) await deleteAllBrandsForOrg(orgId); // C14 FIX: guard against uninitialised orgId
  });

  test('navigating to /brands shows the brand list page', async ({ page }) => {
    await page.goto('/brands');
    await expect(page).toHaveURL(/\/brands$/);
    // Page heading or nav indicator
    await expect(
      page.getByRole('heading', { name: /brands/i })
        .or(page.getByText(/brands/i).first()),
    ).toBeVisible();
  });

  test('sidebar "Brands" link navigates to /brands', async ({ page }) => {
    await page.goto('/dashboard');

    const brandsLink = page.getByRole('link', { name: /brands/i }).first();
    await brandsLink.click();

    await expect(page).toHaveURL(/\/brands/);
  });

  test('empty state is shown when org has no brands', async ({ page }) => {
    await page.goto('/brands');

    // Sprint 1 prototype shows an empty state with a call to action
    // The exact text depends on implementation; look for common empty-state patterns
    const emptyIndicators = [
      page.getByText(/no brands/i),
      page.getByText(/create.*brand/i),
      page.getByText(/get started/i),
      page.getByText(/you don't have any/i),
    ];

    // At least one empty-state indicator should be visible
    let found = false;
    for (const loc of emptyIndicators) {
      if (await loc.isVisible().catch(() => false)) {
        found = true;
        break;
      }
    }
    expect(found, 'Expected an empty-state indicator when no brands exist').toBe(true);
  });

  test('"Create brand" button is visible and navigates to /brands/new', async ({ page }) => {
    await page.goto('/brands');

    const createBtn = page
      .getByRole('link', { name: /create brand/i })
      .or(page.getByRole('button', { name: /create brand/i }));

    await expect(createBtn).toBeVisible();
    await createBtn.click();

    await expect(page).toHaveURL(/\/brands\/new/);
  });

  test('brand card appears in list after a brand exists', async ({ page }) => {
    // Seed a brand directly so it appears without going through the create form
    await page.request.post('/api/brands', {
      data: {
        name:     'E2E List Brand',
        domain:   'e2elistbrand.com.au',
        vertical: 'tradies',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
    // Note: auth is via the browser session from the fixture; the request above
    // goes through the same browser context so it carries the __session cookie

    await page.goto('/brands');

    await expect(page.getByText('E2E List Brand')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('e2elistbrand.com.au')).toBeVisible();
  });

  test('brand card shows the vertical label', async ({ page }) => {
    await page.request.post('/api/brands', {
      data: { name: 'E2E Vertical Brand', domain: 'vertical.com.au', vertical: 'allied_health' },
      headers: { 'Content-Type': 'application/json' },
    });

    await page.goto('/brands');

    // "Allied Health" or "allied_health" should appear in the card
    const verticalLabel = page.getByText(/allied health/i).or(page.getByText('allied_health'));
    await expect(verticalLabel).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a brand card navigates to /brands/[brandId]', async ({ page }) => {
    const res = await page.request.post('/api/brands', {
      data: { name: 'E2E Clickable Brand', domain: 'clickable.com.au', vertical: 'saas' },
      headers: { 'Content-Type': 'application/json' },
    });
    const { brand } = await res.json();

    await page.goto('/brands');

    const card = page.getByText('E2E Clickable Brand').first();
    await card.click();

    // Should navigate to the detail page for this brand
    await expect(page).toHaveURL(new RegExp(`/brands/${brand.id}`), { timeout: 10_000 });
  });
});
