/**
 * F06 — AuditResultsBasic: rate_limited scenario (Inngest retry)
 *
 * BC7 FIX: MOCK_SCENARIO=rate_limited MUST be set via F06-rate-limited.bat.
 *
 * TC-F06-01  rate_limited audit recovers and completes (Inngest retry handles 429)
 * TC-F06-02  "Complete" badge visible after retry recovery
 * TC-F06-03  Score > 0 (retry succeeded → mentions recorded)
 * TC-F06-04  API: status=complete, citationCount=200 (retry recovered all calls)
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
  assertMockScenario('rate_limited');
  const { orgId } = await ensureOrg1();
  org1Id = orgId;
  await deleteQAData(org1Id);
  brand1Id = await createQABrand(org1Id, 'F06');
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
});

test.describe('F06 — rate_limited: Inngest retry recovers 429', () => {

  let auditId = '';

  test('TC-F06-01: rate_limited audit completes after Inngest retry (allow 120s)', async ({ page }) => {
    const postPromise = page.waitForResponse(
      r => r.url().includes('/api/audits') && r.request().method() === 'POST',
    );
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();
    const res  = await postPromise;
    const body = await res.json() as { auditId: string };
    auditId = body.auditId;
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
    // Allow extra time — Inngest needs to retry the rate-limited step
    const { status } = await pollAuditStatus(page, auditId, 100_000);
    expect(status).toBe('complete');
  });

  test('TC-F06-02: "Complete" badge visible after retry recovery', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByText(/^complete$/i).or(page.locator('[class*="success"]').getByText(/complete/i).first())
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F06-03: Score > 0 (retry succeeded)', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    const scoreEl = page.locator('[class*="font-semibold"], [class*="text-xl"], [class*="text-2xl"]')
      .filter({ hasText: /^\d{1,3}(\.\d)?$/ });
    await expect(scoreEl.first()).toBeVisible({ timeout: 12_000 });
    const txt   = await scoreEl.first().textContent() ?? '';
    const score = parseFloat(txt.trim());
    expect(score).toBeGreaterThan(0);
  });

  test('TC-F06-04: API status=complete, citationCount=200', async ({ page }) => {
    if (!auditId) test.skip();
    const res  = await page.request.get(`/api/audits/${auditId}`);
    const body = await res.json() as { citationCount: number; audit: { status: string } };
    expect(body.audit.status).toBe('complete');
    expect(body.citationCount).toBe(200);
  });
});
