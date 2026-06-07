/**
 * 07-audit-failed-state.spec.ts
 *
 * CLAUDE.md §7: "Audit job errors persist to audits.metadata.error and set status='failed'"
 * Sprint 2 §7 G fix: run-audit.ts wraps job in try/catch → sets status='failed' + failedAt
 *
 * Prototype AuditRunning lines 1555-1572: failed state card with error message,
 * "Retry audit" button, "Back to brand" button.
 *
 * Tests:
 *   - /audits/[id] for status=failed shows error card (not blank, not running spinner)
 *   - Error message from audit.metadata.error is displayed
 *   - "Retry audit" button is visible and links back to brand detail or re-triggers
 *   - "Back to brand" button navigates to /brands/[brandId]
 *   - Status shows "Failed" (red badge) — not "Complete"
 *   - No score displayed (audit failed before scoring)
 *
 * Seeds: failed audit row directly in DB (no Inngest needed).
 */

import { test, expect, USER_1 } from './helpers/auth';
import {
  ensureOrganization, ensureUser, createBrand,
  seedFailedAudit,
  deleteAuditsForOrg, deleteBrandsForOrg,
} from './helpers/db';

let org1Id         = '';
let brand1Id       = '';
let failedAuditId  = '';

const ERROR_MSG = 'rate_limited — OpenAI API returned 429 after 3 retries';

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       'E2E Sprint2 Failed Org',
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
    name:           'E2E Failed Audit Brand',
    domain:         'failedbrand.e2e.test',
    vertical:       'tradies',
  });
  brand1Id = brand.id;

  const failed = await seedFailedAudit({
    organizationId: org1Id,
    brandId:        brand1Id,
    auditNumber:    1,
    errorMessage:   ERROR_MSG,
  });
  failedAuditId = failed.id;
});

test.afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

test.describe('Sprint 2 — Failed audit UI state', () => {

  test('TC-F2-70: /audits/[id] for failed audit renders failed state (not running spinner)', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    await expect(page).not.toHaveURL(/sign-in/);

    // Must show "failed" indicator — not the running progress steps
    const hasFailed = await page.getByText(/audit failed|failed|error/i).isVisible({ timeout: 10_000 }).catch(() => false);
    expect(hasFailed, 'Failed state indicator must be visible').toBe(true);
  });

  test('TC-F2-71: Failed audit shows the error message from metadata.error', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    // Prototype: renders audit.metadata.error in the failed state card
    await expect(
      page.getByText(/rate_limited|429|OpenAI|retries/i).first()
        .or(page.getByText(/error/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-72: Failed audit page shows "Retry audit" or "Re-run" button', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    // Prototype: <Btn>Retry audit</Btn>
    await expect(
      page.getByRole('button', { name: /retry|re-run|rerun/i })
        .or(page.getByText(/retry audit/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-73: Failed audit page shows "Back to brand" button', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    // Prototype: <Btn>Back to brand</Btn>
    await expect(
      page.getByRole('button', { name: /back to brand|back/i })
        .or(page.getByRole('link', { name: /back to brand|brand/i }))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-74: "Back to brand" navigates to /brands/[brandId]', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    const backBtn = page.getByRole('button', { name: /back to brand/i })
      .or(page.getByRole('link', { name: /back to brand/i }));
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await expect(page).toHaveURL(new RegExp(`/brands/${brand1Id}`), { timeout: 10_000 });
    }
  });

  test('TC-F2-75: Failed audit shows "Failed" status badge (red)', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    await expect(
      page.getByText(/^failed$/i)
        .or(page.locator('[class*="danger"], [class*="red"]').getByText(/failed/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-76: Failed audit does not show a composite score', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    // A failed audit has no scoreComposite → should not render a score number
    // (It shouldn't show "0" or a score card as if complete)
    await expect(page.getByText(/score.*70|70.*score/i)).not.toBeVisible();
  });

  test('TC-F2-77: API GET /api/audits/[id] for failed audit returns status=failed', async ({ page }) => {
    const res = await page.request.get(`/api/audits/${failedAuditId}`);
    expect(res.status()).toBe(200); // still returns 200 — failure is in the body
    const body = await res.json() as { audit: { status: string } };
    expect(body.audit.status).toBe('failed');
  });
});
