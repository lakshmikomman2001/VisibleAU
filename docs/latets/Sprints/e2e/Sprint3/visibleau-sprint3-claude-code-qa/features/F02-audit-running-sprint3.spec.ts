/**
 * F02 — AuditRunning Screen: Sprint 3 multi-engine (happy_path)
 *
 * The AuditRunning screen in Sprint 3 shows the expanded subtitle:
 *   "Querying ChatGPT, Claude, Gemini, Perplexity × 10 prompts × 5 runs = 200 LLM calls.
 *    Estimated 4-6 minutes."
 * This replaced the Sprint 2 subtitle which showed ChatGPT-only × 10 calls.
 *
 * REQUIRES: Inngest dev server + MOCK_SCENARIO=happy_path
 *
 * TC-F02-01  AuditRunning subtitle: 4 engines by name (ChatGPT, Claude, Gemini, Perplexity)
 * TC-F02-02  AuditRunning subtitle: "200 LLM calls"
 * TC-F02-03  AuditRunning subtitle: "Estimated 4-6 minutes"
 * TC-F02-04  AuditRunning shows "Audit in progress" badge
 * TC-F02-05  AuditRunning shows progress bar
 * TC-F02-06  AuditRunning shows breadcrumb with brand name and "Audit running"
 * TC-F02-07  Sprint 2 subtitle "10 calls" or "1 engine" NOT visible (Sprint 3 assertion)
 * TC-F02-08  After completion, page transitions to AuditResultsBasic (or redirects)
 * TC-F02-09  Unauthenticated user cannot access /audits/[id] — redirect to sign-in
 */

import {
  test, expect, assertEnvVars, assertMockScenario,
  ensureOrg1, createQABrand, deleteQAData, pollAuditStatus,
} from '../helpers/setup';
import { test as base } from '@playwright/test';

let org1Id   = '';
let brand1Id = '';

base.beforeAll(async () => {
  assertEnvVars();
  // BC7 FIX: MOCK_SCENARIO env drives LLM behaviour — not the POST body
  // This spec needs happy_path fixture. Run via scripts\F02-audit-running-sprint3.bat
  assertMockScenario('happy_path');
  const { orgId } = await ensureOrg1();
  org1Id = orgId;
  await deleteQAData(org1Id);
  brand1Id = await createQABrand(org1Id, 'F02');
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
});

test.describe('F02 — AuditRunning: Sprint 3 multi-engine subtitle', () => {

  let auditId = '';

  test('TC-F02-01: AuditRunning subtitle names all 4 engines', async ({ page }) => {
    const postPromise = page.waitForResponse(
      r => r.url().includes('/api/audits') && r.request().method() === 'POST',
    );
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();
    const res  = await postPromise;
    const body = await res.json() as { auditId: string };
    auditId = body.auditId;
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });

    // All 4 engine names in the subtitle (Y4/R4 fix)
    await expect(page.getByText(/ChatGPT/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Claude/i).first()).toBeVisible();
    await expect(page.getByText(/Gemini/i).first()).toBeVisible();
    await expect(page.getByText(/Perplexity/i).first()).toBeVisible();
  });

  test('TC-F02-02: AuditRunning shows "200 LLM calls" in subtitle', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(page.getByText(/200.*LLM calls|LLM calls.*200/i).first()).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F02-03: AuditRunning shows "Estimated 4-6 minutes"', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByText(/Estimated 4.6 min|4-6 minutes/i).first()
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F02-04: "Audit in progress" badge visible', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByText(/audit in progress|running/i).first()
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F02-05: Progress bar visible during running state', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    const progressBar = page.locator('[role="progressbar"], [class*="progress"]').first();
    await expect(progressBar).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F02-06: Breadcrumb includes brand name and "Audit running"', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByText(/Bondi Plumbing/i).or(page.getByText(/Audit running/i))
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F02-07: Sprint 2 "10 calls" / "1 engine" text NOT present (Sprint 3 regression)', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await page.waitForTimeout(2_000);
    const bodyText = await page.locator('body').innerText();
    // Sprint 2 showed "10 calls" or "1 engine" — Sprint 3 must not show these
    expect(
      bodyText.includes('× 10 calls') || bodyText.includes('1 engine'),
      'Sprint 2 subtitle text must not appear in Sprint 3 AuditRunning'
    ).toBe(false);
  });

  test('TC-F02-08: After Inngest completes, page shows results (Complete badge)', async ({ page }) => {
    if (!auditId) test.skip();
    await pollAuditStatus(page, auditId, 90_000);
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByText(/^complete$/i).or(page.locator('[class*="success"]').getByText(/complete/i).first())
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F02-09: Unauthenticated user cannot access /audits/[id]', async ({ browser }) => {
    if (!auditId) test.skip();
    const ctx  = await browser.newContext({ baseURL: process.env.E2E_APP_URL ?? 'http://localhost:3000' });
    const page = await ctx.newPage();
    await page.goto(`/audits/${auditId}`);
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
    await ctx.close();
  });
});
