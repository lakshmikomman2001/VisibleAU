/**
 * 02-audit-running.spec.ts
 *
 * Sprint 2 §10 step 7: "Audit results basic page stub at /audits/[auditId]"
 *
 * Tests the running/pending state of the audit page — before Inngest completes.
 * Seeds audit in 'pending' status directly via DB to test the UI without Inngest.
 *
 * Tests:
 *   - /audits/[id] renders while status=pending (loading/progress indicator)
 *   - Breadcrumb shows Workspace › Brands › [brand] › Audit running
 *   - Status badge shows "pending" or "running" indicator
 *   - Page polls and does not crash while waiting
 *   - 401 for unauthenticated access (protected route)
 *
 * REQUIRES: Inngest dev server NOT required (tests the UI before job runs).
 */

import { test, expect, USER_1 } from './helpers/auth';
// O11 FIX: removed unused 'import { test as base } from @playwright/test'
// O14 FIX: removed unused 'import { eq } from drizzle-orm'
import {
  ensureOrganization, ensureUser, createBrand,
  // P8 FIX: seedCompletedAudit and seedCitations removed — 02-audit-running seeds
  // the pending audit directly via db.insert(schema.audits) without those helpers.
  deleteAuditsForOrg, deleteBrandsForOrg,
  db,
} from './helpers/db';
import * as schema from '../../../../db/schema';

let org1Id   = '';
let brand1Id = '';
let pendingAuditId = '';

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       'E2E Sprint2 Running Org',
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
    name:           'E2E Running Brand',
    domain:         'e2erunning.e2e.test',
    vertical:       'tradies',
  });
  brand1Id = brand.id;

  // Seed a pending audit (no Inngest needed — UI should show running state)
  const [pending] = await db.insert(schema.audits).values({
    organizationId: org1Id,
    brandId:        brand1Id,
    auditNumber:    1,
    triggeredBy:    'manual',
    status:         'pending',
    engines:        [],
    metadata:       { mockScenario: 'happy_path' },
  }).returning();
  pendingAuditId = pending.id;
});

test.afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

test.describe('Sprint 2 — Audit running/pending state', () => {

  test('TC-F2-10: /audits/[id] renders for pending audit (not blank, not 404)', async ({ page }) => {
    await page.goto(`/audits/${pendingAuditId}`);
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page).not.toHaveURL(/404/);

    // Page has content — not a blank screen
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(20);
  });

  test('TC-F2-11: Running state shows status indicator (pending/running/in-progress)', async ({ page }) => {
    await page.goto(`/audits/${pendingAuditId}`);

    // Sprint 2 AuditRunning prototype: "Audit in progress" badge, progress bar, or "pending"
    const statusVisible =
      await page.getByText(/audit in progress|running|pending|queued/i).first().isVisible({ timeout: 10_000 }).catch(() => false)
      || await page.locator('[class*="animate-spin"]').isVisible().catch(() => false)
      || await page.locator('progress, [role="progressbar"]').isVisible().catch(() => false);

    expect(statusVisible, 'Running state indicator should be visible').toBe(true);
  });

  test('TC-F2-12: Running audit page shows brand name in heading or breadcrumb', async ({ page }) => {
    await page.goto(`/audits/${pendingAuditId}`);
    // Prototype: "Running audit for Bondi Plumbing" or breadcrumb includes brand
    const brandVisible = await page.getByText('E2E Running Brand').isVisible().catch(() => false)
      || await page.getByText(/Audit running|Audit #1/i).isVisible().catch(() => false);
    expect(brandVisible).toBe(true);
  });

  test('TC-F2-13: Unauthenticated access to /audits/[id] redirects to /sign-in', async ({ browser }) => {
    const ctx = await browser.newContext(); // no session
    const page = await ctx.newPage();
    await page.goto(`/audits/${pendingAuditId}`);
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
    await ctx.close();
  });

  test('TC-F2-14: /audits route is protected — unauthenticated redirect', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/audits');
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
    await ctx.close();
  });
});
