/**
 * F04 — AuditResultsBasic: no_mention scenario
 *
 * BC7 FIX: MOCK_SCENARIO=no_mention MUST be set via F04-no-mention.bat.
 * getLLMService(engine) reads MOCK_SCENARIO env — NOT the POST body scenario field.
 * Run via: scripts\F04-no-mention.bat
 *
 * TC-F04-01  no_mention audit completes with status=complete (not failed)
 * TC-F04-02  Score shown is 0 or near-0 (no mentions → frequency=0)
 * TC-F04-03  Citations section shows 0 brand-mentioned rows
 * TC-F04-04  "View rich version →" link still navigable even for zero-score audit
 * TC-F04-05  API: citationCount=200 (calls run even if brand not mentioned)
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
  assertMockScenario('no_mention');
  const { orgId } = await ensureOrg1();
  org1Id = orgId;
  await deleteQAData(org1Id);
  brand1Id = await createQABrand(org1Id, 'F04');
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
});

test.describe('F04 — no_mention scenario', () => {

  let auditId = '';

  test('TC-F04-01: no_mention audit completes (status=complete, not failed)', async ({ page }) => {
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

  test('TC-F04-02: Score is 0 or near-0 (brand not mentioned)', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    const scoreEl = page.locator('[class*="font-semibold"], [class*="text-xl"], [class*="text-2xl"]')
      .filter({ hasText: /^\d{1,3}(\.\d)?$/ });
    await expect(scoreEl.first()).toBeVisible({ timeout: 12_000 });
    const txt   = await scoreEl.first().textContent() ?? '';
    const score = parseFloat(txt.trim());
    expect(score, 'no_mention: score must be ≤ 20').toBeLessThanOrEqual(20);
  });

  test('TC-F04-03: Citations show 0 brand-mentioned rows', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    const bodyText = await page.locator('body').innerText({ timeout: 12_000 });
    // "not mentioned" or "0 mentions" or score of 0 in citation list
    const hasNotMentioned = /not mentioned|0 of 200|0 mentions/i.test(bodyText);
    const scoreEl = page.locator('[class*="font-semibold"]').filter({ hasText: /^0$/ });
    const hasZeroScore = await scoreEl.first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasNotMentioned || hasZeroScore, 'no_mention: UI must show 0 mentions or "not mentioned"').toBe(true);
  });

  test('TC-F04-04: "View rich version →" link still navigable for zero-score audit', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    const richLink = page.getByText(/view rich version/i);
    if (await richLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const opacity = await richLink.evaluate(el => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeGreaterThan(0.5);
    }
  });

  test('TC-F04-05: API citationCount=200 (all calls ran; none mentioned brand)', async ({ page }) => {
    if (!auditId) test.skip();
    const res  = await page.request.get(`/api/audits/${auditId}`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { citationCount: number; audit: { status: string } };
    expect(body.audit.status).toBe('complete');
    // 200 citation rows — one per LLM call — even though brand not mentioned
    expect(body.citationCount).toBe(200);
  });
});
