/**
 * F07-audit-running.spec.ts
 *
 * Sprint 4 §8 — Audit running screen /audits/[id] (status=running/pending).
 *
 * Tests:
 *   F07-01  Running screen visible when audit status=running (seeded)
 *   F07-02  "Audit in progress" badge or progress text visible
 *   F07-03  Progress bar or live metrics visible
 *   F07-04  Shows estimated time text (4-6 minutes for paid, 2-3 for free)
 *   F07-05  Failed audit renders error card (U6 fix) with Retry + Back-to-brand
 *   F07-06  "Retry audit" button re-triggers POST /api/audits (re-run flow)
 */

import { test, expect } from '@playwright/test';
import {
  seedOrganization, seedUser, seedBrand, seedAudit,
  deleteAllTestDataForOrg,
} from '../helpers/db';
import { goto, screenshot } from '../helpers/page';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

let orgId        = '';
let brandId      = '';
let runningAuditId = '';
let failedAuditId  = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 AuditRunning Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);

  const brand = await seedBrand({ organizationId: orgId, name: 'Running Brand', domain: 'running.e2e-s4ui.test' });
  brandId = brand.id;

  // Seed a 'running' audit so we can test the running UI
  const running = await seedAudit({
    organizationId: orgId, brandId, auditNumber: 1, status: 'running',
    engines: ['chatgpt', 'claude', 'gemini', 'perplexity'],
  });
  runningAuditId = running.id;

  // Seed a 'failed' audit to test the error card (U6 fix)
  const failed = await seedAudit({
    organizationId: orgId, brandId, auditNumber: 2, status: 'failed',
  });
  failedAuditId = failed.id;
  // Manually set metadata.error on the failed audit
  const { db } = await import('../helpers/db');
  const { audits } = await import('../../../../../db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(audits)
    .set({ metadata: { mockScenario: 'happy_path', error: 'rate_limited — test error' } })
    .where(eq(audits.id, failedAuditId));
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F07-01: running screen visible when audit status=running', async ({ page }) => {
  await goto(page, `/audits/${runningAuditId}`);
  // The running screen should render (not a results page)
  // Look for text that appears only on the running screen
  await expect(
    page.getByText(/in progress|running|querying|engines/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F07-01-running-screen');
});

test('F07-02: "Audit in progress" badge visible on running screen', async ({ page }) => {
  await goto(page, `/audits/${runningAuditId}`);
  await expect(
    page.getByText(/audit in progress|in progress/i).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test('F07-03: progress UI or live metrics visible', async ({ page }) => {
  await goto(page, `/audits/${runningAuditId}`);
  // Progress bar OR the LLM calls counter must be visible
  const progressBar = page.locator('[class*="progress"], [style*="width"]').first();
  const callsText   = page.getByText(/llm calls|of.*calls|\d+\s*\/\s*\d+/i).first();
  const hasProgress = await progressBar.isVisible({ timeout: 8_000 }).catch(() => false);
  const hasCalls    = await callsText.isVisible({ timeout: 8_000 }).catch(() => false);
  expect(hasProgress || hasCalls, 'Expected progress UI or calls counter').toBe(true);
  await screenshot(page, 'F07-03-progress');
});

test('F07-04: estimated time text visible on running screen', async ({ page }) => {
  await goto(page, `/audits/${runningAuditId}`);
  await expect(
    page.getByText(/estimated|4-6 minutes|2-3 minutes|minutes/i).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test('F07-05: failed audit renders error card with Retry + Back-to-brand buttons (U6 fix)', async ({ page }) => {
  await goto(page, `/audits/${failedAuditId}`);
  // U6: failed state card — red border, "Audit failed" title
  await expect(
    page.getByText(/audit failed|failed/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  // Must show Retry button
  await expect(
    page.getByRole('button', { name: /retry|retry audit/i }).first(),
  ).toBeVisible({ timeout: 10_000 });
  // Must show Back-to-brand button
  await expect(
    page.getByRole('button', { name: /back.*brand|brand/i }).first(),
  ).toBeVisible({ timeout: 10_000 });
  await screenshot(page, 'F07-05-failed-card');
});

test('F07-06: Retry audit re-triggers POST /api/audits and navigates to new running screen', async ({ page }) => {
  await goto(page, `/audits/${failedAuditId}`);
  await expect(page.getByRole('button', { name: /retry|retry audit/i }).first()).toBeVisible({ timeout: 15_000 });

  const auditPostPromise = page.waitForResponse(
    r => r.url().includes('/api/audits') && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: /retry|retry audit/i }).first().click();
  const auditResponse = await auditPostPromise;

  expect(auditResponse.status()).toBe(201);
  // Should navigate to new audit running screen
  await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
  await screenshot(page, 'F07-06-retry-redirect');
});
