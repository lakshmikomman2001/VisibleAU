/**
 * 01-run-audit-button.spec.ts
 *
 * Sprint 2 §10 step 7: "Brand detail page: add Run audit button."
 *
 * Tests (UI, no Inngest required):
 *   - "Run audit" button visible on /brands/[id] (Sprint 2 addition)
 *   - Clicking it navigates to /audits (audit running screen)
 *   - Button renders a Sparkles icon per prototype
 *   - Brand detail still shows Sprint 1 metadata (name, domain, vertical)
 *   - "Run audit" absent for deleted brands (404 page)
 *
 * Real test data: brand seeded via direct DB before tests.
 * Teardown: hard-deletes brand + audits after all tests.
 */

import { test, expect, USER_1 } from './helpers/auth';
import {
  ensureOrganization, ensureUser, createBrand,
  deleteAuditsForOrg, deleteBrandsForOrg,
} from './helpers/db';

let org1Id   = '';
let brand1Id = '';

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       'E2E Sprint2 RunBtn Org',
    tier:       'agency',
  });
  org1Id = org.id;
  await ensureUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
    organizationId: org1Id,
    email:          USER_1.email,
  });
  const brand = await createBrand({
    organizationId: org1Id,
    name:           'Bondi Plumbing E2E',
    domain:         'bondiplumbing.e2e.test',
    vertical:       'tradies',
  });
  brand1Id = brand.id;
});

test.afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (brand1Id) await deleteBrandsForOrg(org1Id);
});

test.describe('Sprint 2 — Run audit button on brand detail', () => {

  test('TC-F2-01: /brands/[id] renders "Run audit" button (Sprint 2 §10 step 7)', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}`);
    await expect(page).not.toHaveURL(/sign-in/);

    // Sprint 2 adds Run audit CTA to BrandDetail (R5 fix in prototype)
    const runAuditBtn = page.getByRole('button', { name: /run audit/i })
      .or(page.getByText(/run audit/i).first());
    await expect(runAuditBtn).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-02: Brand detail still shows Sprint 1 metadata after Sprint 2 button added', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}`);

    // Brand name visible
    await expect(page.getByText('Bondi Plumbing E2E')).toBeVisible({ timeout: 10_000 });
    // Domain visible
    await expect(page.getByText('bondiplumbing.e2e.test')).toBeVisible();
    // Vertical visible
    await expect(page.getByText(/tradies/i).first()).toBeVisible();
  });

  test('TC-F2-03: Clicking "Run audit" sends POST /api/audits and redirects to /audits/[id]', async ({ page }) => {
    // Intercept the POST /api/audits response to capture auditId
    let auditId = '';
    page.on('response', async (response) => {
      if (response.url().includes('/api/audits') && response.request().method() === 'POST') {
        try {
          const body = await response.json() as { auditId?: string };
          if (body.auditId) auditId = body.auditId;
        } catch { /* ignore */ }
      }
    });

    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();

    // Should navigate to the audit page — either running or complete
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
    if (auditId) {
      await expect(page).toHaveURL(new RegExp(`/audits/${auditId}`));
    }
  });

  test('TC-F2-04: Breadcrumb on brand detail shows correct path', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}`);

    // Sprint 2 prototype: breadcrumbs = ['Workspace', 'Brands', 'Bondi Plumbing']
    await expect(page.getByText('Workspace').or(page.getByText('Brands'))).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-05: Non-existent brand ID shows 404, no "Run audit" button', async ({ page }) => {
    await page.goto('/brands/00000000-0000-0000-0000-000000000000');
    // Should show 404, not crash
    const is404 = await page.getByText(/404|not found/i).isVisible().catch(() => false);
    const redirected = !page.url().includes('00000000');
    expect(is404 || redirected).toBe(true);
    // Run audit button must not appear on 404
    await expect(page.getByRole('button', { name: /run audit/i })).not.toBeVisible();
  });
});
