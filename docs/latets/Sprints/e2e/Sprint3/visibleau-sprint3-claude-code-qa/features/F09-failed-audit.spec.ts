/**
 * F09 — Failed Audit State: Sprint 3 multi-engine
 *
 * A failed Sprint 3 audit shows the failed state UI with 4-engine context.
 * Uses DB-seeded failed audit — no Inngest required.
 *
 * TC-F09-01  /audits/[id] for a failed audit shows "Failed" badge
 * TC-F09-02  Failed audit does NOT show "View rich version" as navigable (no rich data)
 * TC-F09-03  API GET /api/audits/[id] returns status=failed
 * TC-F09-04  AA5 FIX — GET /api/audits/[id]/full for failed audit shows null scores
 */

import {
  test, expect, assertEnvVars,
  ensureOrg1, createQABrand, deleteQAData, db,
} from '../helpers/setup';
import { test as base } from '@playwright/test';
import * as schema from '../../db/schema';

let org1Id   = '';
let brand1Id = '';
let failedAuditId = '';

const ERROR_MSG = 'Mock LLM failure: all engines exhausted';

base.beforeAll(async () => {
  assertEnvVars();
  const { orgId } = await ensureOrg1();
  org1Id = orgId;
  await deleteQAData(org1Id);
  brand1Id = await createQABrand(org1Id, 'F09');

  const [audit] = await db.insert(schema.audits).values({
    organizationId: org1Id,
    brandId:        brand1Id,
    auditNumber:    1,
    triggeredBy:    'manual',
    status:         'failed',
    engines:        ['chatgpt', 'claude', 'gemini', 'perplexity'],
    promptsCount:   10,
    runsPerPrompt:  5,
    totalCalls:     0,
    metadata:       { error: ERROR_MSG, mockScenario: 'happy_path' },
    startedAt:      new Date(Date.now() - 60_000),
    failedAt:       new Date(),
  }).returning();
  failedAuditId = audit.id;
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
});

test.describe('F09 — Failed Audit: Sprint 3 state', () => {

  test('TC-F09-01: Failed audit shows "Failed" badge', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    await expect(page.getByText(/^failed$/i).or(page.locator('[class*="danger"]').getByText(/failed/i).first())).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/^complete$/i)).not.toBeVisible();
  });

  test('TC-F09-02: Failed audit does not show navigable "View rich version"', async ({ page }) => {
    await page.goto(`/audits/${failedAuditId}`);
    const richLink = page.getByText(/view rich version/i);
    if (await richLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // If visible, must be disabled (opacity-40 or similar)
      const opacity = await richLink.evaluate(el => getComputedStyle(el).opacity);
      expect(parseFloat(opacity), 'Failed audit: rich link must be greyed out').toBeLessThan(0.8);
    }
  });

  test('TC-F09-03: API returns status=failed for failed audit', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${failedAuditId}`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { audit: { status: string } };
    expect(body.audit.status).toBe('failed');
  });

  test('TC-F09-04: AA5 FIX — GET /api/audits/[id]/full for failed audit — scores are null', async ({ page }) => {
    // AA5 FIX: /audits/[id]/rich page is Sprint 4 scope (does not exist in Sprint 3).
    // Test the Sprint 3 API route: /api/audits/[id]/full for a failed audit must return 200
    // but with null dimension scores (no scoring ran on failed audit).
    const res  = await page.request.get(`/api/audits/${failedAuditId}/full`);
    // May return 200 (audit exists, status=failed) or 404 depending on implementation
    // Either way it must NOT return well-formed dimension scores
    if (res.status() === 200) {
      const body = await res.json() as { audit: Record<string, unknown> };
      const comp = body.audit.scoreComposite;
      // Failed audit has no composite score — must be null
      expect(comp, 'Failed audit scoreComposite must be null').toBeNull();
    } else {
      // 404 or 400 is also acceptable for a failed audit
      expect([404, 400]).toContain(res.status());
    }
  });
});
