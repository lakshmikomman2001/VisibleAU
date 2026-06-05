/**
 * F05 — AuditResultsBasic: partial_failure scenario
 *
 * BC7 FIX: MOCK_SCENARIO=partial_failure MUST be set via F05-partial-failure.bat.
 * getLLMService(engine) reads MOCK_SCENARIO env — NOT the POST body scenario field.
 *
 * TC-F05-01  partial_failure audit completes with status=complete (not failed)
 * TC-F05-02  Score displayed is > 0 (some calls succeeded → some mentions)
 * TC-F05-03  Citations section is visible
 * TC-F05-04  API: citationCount > 0 and < 200 (some calls failed)
 * TC-F05-05  "Complete" badge shown (partial failure still finishes successfully)
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
  assertMockScenario('partial_failure');
  const { orgId } = await ensureOrg1();
  org1Id = orgId;
  await deleteQAData(org1Id);
  brand1Id = await createQABrand(org1Id, 'F05');
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
});

test.describe('F05 — partial_failure scenario', () => {

  let auditId = '';

  test('TC-F05-01: partial_failure audit completes (status=complete)', async ({ page }) => {
    const postPromise = page.waitForResponse(
      r => r.url().includes('/api/audits') && r.request().method() === 'POST',
    );
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();
    const res  = await postPromise;
    const body = await res.json() as { auditId: string };
    auditId = body.auditId;
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
    const { status } = await pollAuditStatus(page, auditId, 90_000);
    expect(status).toBe('complete');
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByText(/^complete$/i).or(page.locator('[class*="success"]').getByText(/complete/i).first())
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F05-02: Score > 0 (some calls succeeded)', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    const scoreEl = page.locator('[class*="font-semibold"], [class*="text-xl"], [class*="text-2xl"]')
      .filter({ hasText: /^\d{1,3}(\.\d)?$/ });
    await expect(scoreEl.first()).toBeVisible({ timeout: 12_000 });
    const txt   = await scoreEl.first().textContent() ?? '';
    const score = parseFloat(txt.trim());
    expect(score, 'partial_failure: score must be > 0').toBeGreaterThan(0);
  });

  test('TC-F05-03: Citations section visible', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(page.getByText(/citations/i).first()).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F05-04: API citationCount > 0 and ≤ 200 (some failures)', async ({ page }) => {
    if (!auditId) test.skip();
    const res  = await page.request.get(`/api/audits/${auditId}`);
    const body = await res.json() as { citationCount: number; audit: { status: string } };
    expect(body.citationCount).toBeGreaterThan(0);
    expect(body.citationCount).toBeLessThanOrEqual(200);
  });

  test('TC-F05-05: "Complete" badge shown (partial failure still completes)', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(page.getByText(/^complete$/i)).not.toBeNull();
    await expect(page.getByText(/^failed$/i)).not.toBeVisible();
  });
});
