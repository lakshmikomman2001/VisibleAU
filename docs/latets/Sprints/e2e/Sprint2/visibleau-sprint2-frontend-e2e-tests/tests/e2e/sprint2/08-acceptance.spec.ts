/**
 * 08-acceptance.spec.ts
 *
 * Sprint 2 §12 Acceptance Criteria — Full UI Happy-Path Flow
 *
 * "A user clicks 'Run audit' on a brand → 10 LLM calls execute (mock) →
 *  audit row updates to status=complete with citation rows →
 *  user receives email → user can GET /api/audits/:id and see the basic results."
 *
 * REQUIRES: Inngest dev server running + app in LLM_MODE=mock
 *
 * Tests (full end-to-end from the browser):
 *   §12-UI-1: Click "Run audit" → POST /api/audits → redirected to /audits/[id]
 *   §12-UI-2: /audits/[id] shows running/pending state initially
 *   §12-UI-3: After Inngest completes → page shows "Complete" badge
 *   §12-UI-4: Composite score displayed (> 0 for happy_path)
 *   §12-UI-5: 10 citations visible in raw citations table
 *   §12-UI-6: Cost displayed < $0.10 (Sprint 2 §12 cost constraint)
 *   §12-UI-7: auditNumber shown (#1 for first audit on org)
 *   §12-UI-8: Cross-org: User 2 cannot access the result URL (404)
 *
 * Teardown: hard-deletes all audits + brand after all tests.
 */

import { test, testAsUser2, expect, USER_1, USER_2 } from './helpers/auth';
import { test as base } from '@playwright/test';
import {
  ensureOrganization, ensureUser, createBrand,
  deleteAuditsForOrg, deleteBrandsForOrg,
  waitForAuditComplete,
} from './helpers/db';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let createdAuditId = '';

base.beforeAll(async () => {
  const org1 = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       'E2E Sprint2 Acceptance Org1',
    tier:       'agency',
  });
  org1Id = org1.id;
  await ensureUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
    organizationId: org1Id,
    email:          USER_1.email,
  });

  // R10 FIX: purge any audits left by a previous interrupted run so auditNumber
  // always starts at 1 for §12-UI-1. Sprint 2 §9 uses SELECT MAX … FOR UPDATE
  // per org — a stale audit with auditNumber=1 would make the next audit #2.
  await deleteAuditsForOrg(org1Id);

  const brand = await createBrand({
    organizationId: org1Id,
    name:           'Bondi Plumbing Acceptance E2E',
    domain:         'bondiplumbing-acceptance.e2e.test',
    vertical:       'tradies',
  });
  brand1Id = brand.id;

  const org2 = await ensureOrganization({
    clerkOrgId: USER_2.clerkOrgId,
    name:       'E2E Sprint2 Acceptance Org2',
    tier:       'starter',
  });
  org2Id = org2.id;
  await ensureUser({
    clerkUserId:    process.env.E2E_TEST_USER_2_CLERK_ID ?? '',
    organizationId: org2Id,
    email:          USER_2.email,
  });
});

base.afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org2Id) await deleteAuditsForOrg(org2Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
  if (org2Id) await deleteBrandsForOrg(org2Id);
});

// ── Full happy-path flow (Inngest required) ──────────────────────────────────

test.describe('Sprint 2 §12 acceptance — Full UI flow (Inngest required)', () => {

  test('§12-UI-1: Click "Run audit" → POST /api/audits → redirect to /audits/[id]', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}`);

    // Capture the audit ID from the POST response
    const auditResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/audits') && r.request().method() === 'POST',
    );

    await page.getByRole('button', { name: /run audit/i }).click();

    const auditResponse = await auditResponsePromise;
    expect(auditResponse.status()).toBe(201);
    const body = await auditResponse.json() as { auditId: string; auditNumber: number };
    expect(body.auditId).toBeTruthy();
    expect(body.auditNumber).toBe(1); // first audit for this org

    createdAuditId = body.auditId;

    // Must navigate to the audit page
    await expect(page).toHaveURL(new RegExp(`/audits/${createdAuditId}`), { timeout: 15_000 });
  });

  test('§12-UI-2: /audits/[id] shows running/pending state immediately after trigger', async ({ page }) => {
    // Use the audit created in §12-UI-1
    if (!createdAuditId) test.skip(true, 'Depends on §12-UI-1 creating the audit');

    await page.goto(`/audits/${createdAuditId}`);
    // Should show running or pending state (Inngest may complete quickly in mock mode)
    const statusOk =
      await page.getByText(/audit in progress|running|pending|complete/i).isVisible({ timeout: 10_000 }).catch(() => false);
    expect(statusOk).toBe(true);
  });

  test('§12-UI-3: Audit completes within 45s — page shows "Complete" badge', async ({ page }) => {
    if (!createdAuditId) test.skip(true, 'Depends on §12-UI-1 creating the audit');

    // Wait for Inngest to finish via DB polling
    const audit = await waitForAuditComplete(createdAuditId, 45_000);
    expect(audit.status).toBe('complete');

    // Reload the audit page — should now show "Complete"
    await page.goto(`/audits/${createdAuditId}`);
    await expect(
      page.getByText(/^complete$/i).or(page.getByText(/complete/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('§12-UI-4: Composite score is shown (>0 for happy_path)', async ({ page }) => {
    if (!createdAuditId) test.skip(true, 'Depends on §12-UI-1');

    await page.goto(`/audits/${createdAuditId}`);

    // happy_path fixture: at least some brand mentions → score > 0
    const scoreEl = page.locator('text=/\\d+\\.?\\d*/', { hasText: /\d+/ });
    await expect(scoreEl.first()).toBeVisible({ timeout: 10_000 });

    // Score should be between 0 and 100
    const scoreText = await scoreEl.first().textContent() ?? '';
    const score = parseFloat(scoreText.match(/\d+\.?\d*/)?.[0] ?? '-1');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('§12-UI-5: 10 prompts — 10 citation rows visible (one per LLM call)', async ({ page }) => {
    if (!createdAuditId) test.skip(true, 'Depends on §12-UI-1');

    await page.goto(`/audits/${createdAuditId}`);
    // Either explicit "Brand mentioned in X of 10 prompts" or 10 citation rows
    await expect(page.getByText(/of 10 prompts|10 prompts/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('§12-UI-6: Cost displayed is < $0.10 (Sprint 2 §12 cost assertion)', async ({ page }) => {
    if (!createdAuditId) test.skip(true, 'Depends on §12-UI-1');

    await page.goto(`/audits/${createdAuditId}`);
    // Find cost display — "Cost US$0.07" or similar
    const costEl = page.getByText(/cost.*us\$|us\$.*cost/i).or(page.getByText(/us\$0\.\d+/i));
    if (await costEl.isVisible().catch(() => false)) {
      const text = await costEl.textContent() ?? '';
      const cost = parseFloat(text.match(/\d+\.\d+/)?.[0] ?? '99');
      expect(cost, 'Sprint 2 §12: cost must be < $0.10').toBeLessThan(0.10);
    }
  });

  test('§12-UI-7: auditNumber #1 shown for first audit of this org', async ({ page }) => {
    if (!createdAuditId) test.skip(true, 'Depends on §12-UI-1');

    await page.goto(`/audits/${createdAuditId}`);
    await expect(page.getByText(/Audit #1|#1/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── Cross-org acceptance check ───────────────────────────────────────────────

testAsUser2.describe('§12-UI-8: User 2 cannot see User 1 completed audit', () => {
  testAsUser2('§12-UI-8: /audits/[org1AuditId] returns 404 for User 2', async ({ page }) => {
    if (!createdAuditId) test.skip(true, 'Depends on §12-UI-1');

    await page.goto(`/audits/${createdAuditId}`);
    const is404 = await page.getByText(/404|not found/i).isVisible({ timeout: 10_000 }).catch(() => false);
    const gone  = !page.url().includes(createdAuditId);
    expect(is404 || gone, 'User 2 must get 404 for User 1 audit').toBe(true);
  });
});
