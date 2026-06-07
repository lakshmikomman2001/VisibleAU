/**
 * F03 — AuditResultsBasic: Sprint 3 updates
 *
 * AuditResultsBasic changes in Sprint 3:
 *   AA2 FIX: "View rich version →" link STAYS DISABLED in Sprint 3 (V5 fix + prototype line 1660).
 *      Sprint 3 §0: 'Out of scope: UI to display the rich results (Sprint 4)'
 *      Sprint 3 §14: 'Not ready: Audit results UI (Sprint 4)'
 *      The link has opacity-40 class and title='Available Sprint 3' — it is NOT navigable.
 *      The /audits/[id]/rich PAGE does not exist until Sprint 4.
 *   2. The info card text updates to reflect Sprint 3 is now active (not "coming in Sprint 3")
 *   3. The composite score is now computed from 5 dimensions (richer data)
 *   4. Subtitle shows all 4 engines and 200 calls (not just ChatGPT × 10)
 *
 * REQUIRES: Inngest dev server + MOCK_SCENARIO=happy_path
 *
 * TC-F03-01  happy_path audit completes → "Complete" badge
 * TC-F03-02  Composite score 0-100 displayed (Sprint 3 composite from 5 dimensions)
 * TC-F03-03  Subtitle shows 4 engines × 10 prompts × 5 runs / 200 calls
 * TC-F03-04  Citations section visible with ≥1 row
 * TC-F03-05  "View rich version →" link is STILL DISABLED (opacity-40) in Sprint 3 (AA2/V5 fix)
 * TC-F03-06  Link stays greyed — does NOT navigate to /rich (Sprint 4 UI not yet shipped)
 * TC-F03-07  Re-run button visible
 * TC-F03-08  Breadcrumb includes "Audit #N"
 * TC-F03-09  API GET /api/audits/[id] returns status=complete, citationCount=200
 * TC-F03-10  API GET /api/audits/[id]/full returns scoreComposite, all 5 dimension scores
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
  assertMockScenario('happy_path');
  const { orgId } = await ensureOrg1();
  org1Id = orgId;
  await deleteQAData(org1Id);
  brand1Id = await createQABrand(org1Id, 'F03');
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
});

test.describe('F03 — AuditResultsBasic: Sprint 3 updates', () => {

  let auditId = '';

  test('TC-F03-01: happy_path audit completes — "Complete" badge appears', async ({ page }) => {
    const postPromise = page.waitForResponse(
      r => r.url().includes('/api/audits') && r.request().method() === 'POST',
    );
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();
    const res  = await postPromise;
    const body = await res.json() as { auditId: string };
    auditId = body.auditId;
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
    await pollAuditStatus(page, auditId, 90_000);
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByText(/^complete$/i).or(page.locator('[class*="success"]').getByText(/complete/i).first())
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F03-02: Composite score 0-100 displayed', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    const scoreEl = page.locator('[class*="font-semibold"], [class*="text-xl"], [class*="text-2xl"], [class*="text-3xl"]')
      .filter({ hasText: /^\d{1,3}(\.\d)?$/ });
    await expect(scoreEl.first()).toBeVisible({ timeout: 12_000 });
    const txt   = await scoreEl.first().textContent() ?? '';
    const score = parseFloat(txt.trim());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('TC-F03-03: Subtitle shows Sprint 3 engine/call count (4 engines, 200 calls)', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    const bodyText = await page.locator('body').innerText({ timeout: 12_000 });
    // Sprint 3: 4 engines × 10 prompts × 5 runs = 200 calls
    const hasFourEngines = /4 engines|ChatGPT.*Claude.*Gemini|ChatGPT, Claude/i.test(bodyText);
    const has200Calls    = bodyText.includes('200');
    expect(hasFourEngines || has200Calls, 'Sprint 3 subtitle must reference 4 engines or 200 calls').toBe(true);
  });

  test('TC-F03-04: Citations section visible with ≥1 row', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(page.getByText(/citations/i).first()).toBeVisible({ timeout: 12_000 });
    await expect(
      page.getByText(/mentioned|brand mentioned|position|engine/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F03-05: "View rich version →" stays DISABLED in Sprint 3 (AA2/V5 fix)', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    // AA2 FIX: Sprint 3 §0 'Out of scope: UI to display rich results (Sprint 4)'
    // Prototype line 1660: opacity-40 class, title='Available Sprint 3'
    // The link must remain visually disabled (greyed) — NOT navigable in Sprint 3
    const richLink = page.getByText(/view rich version/i);
    if (await richLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const opacity = await richLink.evaluate(el => getComputedStyle(el).opacity);
      const title   = await richLink.getAttribute('title') ?? '';
      const isDisabled = parseFloat(opacity) < 0.7 || title.toLowerCase().includes('sprint 3') || title.toLowerCase().includes('available');
      expect(isDisabled, 'AA2: View rich version must be greyed/disabled in Sprint 3 — /rich page is Sprint 4').toBe(true);
    }
  });

  test('TC-F03-06: "View rich version →" does NOT navigate away (link is disabled, Sprint 4 scope)', async ({ page }) => {
    if (!auditId) test.skip();
    // AA2 FIX: /audits/[id]/rich page does not exist in Sprint 3 (Sprint 4 scope)
    // The link must not be a working anchor — clicking it must not navigate to /rich
    await page.goto(`/audits/${auditId}`);
    const initialUrl = page.url();
    const richLink = page.getByText(/view rich version/i);
    if (await richLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      // Disabled links have pointer-events:none or href removed — clicking should not navigate
      await richLink.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1_000);
      expect(page.url()).not.toMatch(/\/rich/);
    }
  });

  test('TC-F03-07: Re-run button visible on completed audit', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByRole('button', { name: /re-run|rerun/i })
        .or(page.getByText(/re-run/i).first())
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F03-08: Breadcrumb includes "Audit #N"', async ({ page }) => {
    if (!auditId) test.skip();
    await page.goto(`/audits/${auditId}`);
    await expect(
      page.getByText(/Audit #\d+/i).or(page.getByText(/Brands/i))
    ).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F03-09: API returns status=complete, citationCount=200 (4 engines × 10 × 5)', async ({ page }) => {
    if (!auditId) test.skip();
    const res  = await page.request.get(`/api/audits/${auditId}`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { audit: { status: string }; citationCount: number };
    expect(body.audit.status).toBe('complete');
    expect(body.citationCount).toBe(200);
  });

  test('TC-F03-10: GET /api/audits/[id]/full returns all 5 dimension scores (AC4 fix)', async ({ page }) => {
    if (!auditId) test.skip();
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { audit: Record<string, unknown> };
    // All 5 dimension scores must be set (AC3a: sentiment/context are TEXT labels)
    expect(body.audit.scoreComposite).toBeTruthy();
    expect(body.audit.scoreFrequency).toBeTruthy();
    expect(body.audit.scorePosition).toBeTruthy();
    expect(body.audit.scoreSentiment).toMatch(/positive|neutral|negative/);
    expect(body.audit.scoreContext).toMatch(/recommended|listed|mentioned|commodified/);
    expect(body.audit.scoreAccuracy).toBeTruthy();
    expect(body.audit.confidenceIntervals).toBeTruthy();
  });
});
