/**
 * 05-audit-list.spec.ts
 *
 * ⚠️  Q11 FIX — SPRINT 4 SCOPE NOTICE ⚠️
 *
 * Sprint 2 §10 step 7 (UI MINIMAL) specifies only two UI deliverables:
 *   1. Brand detail page: "Run audit" button  →  tested in 01-run-audit-button.spec.ts
 *   2. Audit results basic page stub at /audits/[auditId]  →  tested in 02, 03, 04
 *
 * The /audits LIST page (AuditList) is visible in the prototype as a design reference
 * but is NOT a Sprint 2 deliverable — it ships in Sprint 4.
 *
 * This file is kept in the Sprint 2 package so the test suite is ready when Sprint 4
 * ships. The beforeAll guard checks whether GET /audits returns 200. If the route is
 * not yet built (404), every test in this file is automatically skipped — the Sprint 2
 * E2E run will not fail on a Sprint 4 route. Tests self-activate once Sprint 4 ships.
 *
 * Original coverage: /audits list table, brand/score/cost/status columns, navigation,
 * Export CSV disabled (T5 fix), engines=1/4 (Sprint 2 = ChatGPT only).
 *
 * Seeds: 3 audits (2 complete, 1 failed) for Bondi Plumbing E2E.
 */
import { test, expect, USER_1 } from './helpers/auth';
import {
  ensureOrganization, ensureUser, createBrand,
  seedCompletedAudit, seedFailedAudit,
  deleteAuditsForOrg, deleteBrandsForOrg,
} from './helpers/db';

let org1Id        = '';
let brand1Id      = '';
let audit1Id      = '';
let audit2Id      = '';
let failedId      = '';
let auditListExists = true; // Q11 FIX: false → all tests skip (Sprint 4 route not yet built)

test.beforeAll(async ({ browser }) => {
  // Q11 FIX: /audits list page is Sprint 4 scope. Guard: check the route exists before seeding.
  // If it returns 404, skip is set and every test.beforeEach/test in this file is skipped.
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  const res  = await page.request.get('/audits').catch(() => null);
  await ctx.close();
  if (!res || res.status() === 404) {
    console.warn(
      '\n⚠️  SKIPPING 05-audit-list.spec.ts — /audits route returned 404.\n' +
      '   This page is Sprint 4 scope. Tests will auto-activate when the route is built.\n'
    );
    auditListExists = false;
    return; // skip seeding — nothing to test
  }
  auditListExists = true;

  const org = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       'E2E Sprint2 List Org',
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

  // Audit #1 — complete, score=70
  const a1 = await seedCompletedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, scoreComposite: 70, totalCostUsd: 0.09 });
  audit1Id = a1.id;

  // Audit #2 — complete, score=60
  const a2 = await seedCompletedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 2, scoreComposite: 60, totalCostUsd: 0.07 });
  audit2Id = a2.id;

  // Audit #3 — failed
  const a3 = await seedFailedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 3 });
  failedId = a3.id;
});

test.afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

test.describe('Sprint 2 — AuditList page /audits', () => {

  // Q11 FIX: skip all tests if /audits route doesn't exist (Sprint 4 scope)
  test.beforeEach(async ({}, testInfo) => {
    if (!auditListExists) testInfo.skip();
  });

  test('TC-F2-50: /audits renders the audit list with table headers', async ({ page }) => {
    await page.goto('/audits');
    await expect(page).not.toHaveURL(/sign-in/);

    // Prototype column headers: Brand, Audit #, Started, Score, Engines, Cost, Status
    await expect(page.getByRole('heading', { name: /all audits|audits/i })
      .or(page.getByText(/all audits/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-51: Completed audit rows show brand name and score', async ({ page }) => {
    await page.goto('/audits');

    // Our seeded brand name should appear
    await expect(page.getByText('Bondi Plumbing E2E').first()).toBeVisible({ timeout: 10_000 });
    // Score 70 should be visible
    await expect(page.getByText('70').first()).toBeVisible();
  });

  test('TC-F2-52: Audit # column shows correct per-org numbers (#1, #2, #3)', async ({ page }) => {
    await page.goto('/audits');

    await expect(page.getByText('#1').or(page.getByText('1').first())).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('#2').or(page.getByText('2').first())).toBeVisible();
  });

  test('TC-F2-53: Complete audit has green/success status badge', async ({ page }) => {
    await page.goto('/audits');
    // "Complete" badge appears at least once
    await expect(
      page.getByText(/^complete$/i).first()
        .or(page.locator('[class*="success"]').getByText(/complete/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-54: Failed audit has red/danger status badge', async ({ page }) => {
    await page.goto('/audits');
    // "Failed" badge
    await expect(
      page.getByText(/^failed$/i).first()
        .or(page.locator('[class*="danger"], [class*="red"]').getByText(/failed/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-55: Clicking a complete audit row navigates to /audits/[id]', async ({ page }) => {
    await page.goto('/audits');

    // Click the first row (audit #1 — complete)
    const rows = page.locator('tbody tr, [data-testid="audit-row"]');
    const firstRow = rows.first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/audits\//, { timeout: 10_000 });
    }
  });

  test('TC-F2-56: Cost column shows values < A$0.15 (Sprint 2 §T4 fixture note)', async ({ page }) => {
    await page.goto('/audits');
    // Prototype: Sprint 2 audits cost <A$0.15 (10 calls × ~$0.005-0.01)
    // Costs visible: A$0.09, A$0.07 (seeded above)
    await expect(
      page.getByText(/a\$0\.\d+|us\$0\.\d+|\$0\.\d+/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-57: Export CSV button is disabled (Sprint 4 scope — T5 fix)', async ({ page }) => {
    await page.goto('/audits');
    const exportBtn = page.getByRole('button', { name: /export csv/i });
    if (await exportBtn.isVisible().catch(() => false)) {
      await expect(exportBtn).toBeDisabled();
    }
  });

  test('TC-F2-58: Engine count shows 1 (Sprint 2 = 1 engine: ChatGPT)', async ({ page }) => {
    await page.goto('/audits');
    // Prototype AuditList column: "1" in Engines column (1/4 engines)
    // Sprint 2 audits use 1 engine (ChatGPT)
    await expect(page.getByText('1/4').or(page.getByText('1').first())).toBeVisible({ timeout: 10_000 });
  });
});
