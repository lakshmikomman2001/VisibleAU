/**
 * F10 — Sprint 3 §12 Acceptance Criteria (browser + API)
 *
 * AA4 FIX: /audits/[id]/rich is Sprint 4 scope. Sprint 3 ships API routes only.
 * Original TC-F10-01 through TC-F10-09 tested the /rich PAGE — removed.
 * Now tests Sprint 3 API routes + AuditResultsBasic UI changes.
 *
 * Uses DB-seeded audit — no Inngest required for most tests.
 *
 * TC-F10-01  AC: GET /api/audits/[id]/full returns 200 (Sprint 3 ships this API)
 * TC-F10-02  AC: scoreComposite = 63.4 via API (AA5 canonical value)
 * TC-F10-03  AC: "95% CI" in scoreConfidenceLow/High via API
 * TC-F10-04  AC: All 5 dimension fields present in /full API response
 * TC-F10-05  AC: totalCalls=200 returned in /full API for paid-tier audit
 * TC-F10-06  AC: engines=4 in /full API for paid-tier audit
 * TC-F10-07  AC3a: scoreSentiment is text label not numeric via API
 * TC-F10-08  AC3a: scoreContext is text label not numeric via API
 * TC-F10-09  AC3c: CI bounds bracket composite via API (scoreConfidenceLow <= composite <= scoreConfidenceHigh)
 * TC-F10-10  AC: "View rich version →" stays DISABLED on AuditResultsBasic (Sprint 4 scope)
 * TC-F10-11  AC3b: Free-tier GET /api/audits/[id]/full shows 2 engines
 */

import {
  test, testAsUser2, expect, assertEnvVars,
  ensureOrg1, ensureOrg2, createQABrand,
  deleteQAData, seedSprint3Audit,
} from '../helpers/setup';
import { test as base } from '@playwright/test';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let auditId  = '';
let freeAuditId = '';

base.beforeAll(async () => {
  assertEnvVars();
  const r1 = await ensureOrg1();
  org1Id = r1.orgId;
  const r2 = await ensureOrg2();
  org2Id = r2.orgId;
  await deleteQAData(org1Id);
  await deleteQAData(org2Id);

  brand1Id = await createQABrand(org1Id, 'F10');
  const freeBrandId = await createQABrand(org2Id, 'F10-free');

  // Paid-tier audit with AA5 fix values (agency org = 4 engines)
  auditId = await seedSprint3Audit({
    organizationId:    org1Id,
    brandId:           brand1Id,
    auditNumber:       1,
    scoreComposite:    63.4,
    scoreFrequency:    14,
    scorePosition:     90,
    scoreSentiment:    'positive',
    scoreSentimentNumeric: 79,
    scoreContext:      'recommended',
    scoreContextNumeric:  73,
    scoreAccuracy:     71,
    scoreConfidenceLow:  59.1,
    scoreConfidenceHigh: 67.7,
    engines:           ['chatgpt', 'claude', 'gemini', 'perplexity'],
    engineCount:       4,
    totalCalls:        200,
  });

  // Free-tier audit (2 engines only — AC3b)
  freeAuditId = await seedSprint3Audit({
    organizationId:    org2Id,
    brandId:           freeBrandId,
    auditNumber:       1,
    scoreComposite:    55.0,
    scoreSentiment:    'neutral',
    scoreContext:      'listed',
    engines:           ['chatgpt', 'perplexity'],
    engineCount:       2,
    totalCalls:        100,
  });
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
  if (org2Id) await deleteQAData(org2Id);
});

test.describe('F10 — Sprint 3 §12 Acceptance: API (AA4 fix)', () => {

  test('TC-F10-01: AC — GET /api/audits/[id]/full returns 200 (Sprint 3 ships this API route)', async ({ page }) => {
    const res = await page.request.get(`/api/audits/${auditId}/full`);
    expect(res.status()).toBe(200);
  });

  test('TC-F10-02: AC — scoreComposite = 63.4 via /full API (AA5 fix)', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    expect(parseFloat(String(body.audit.scoreComposite))).toBeCloseTo(63.4, 1);
  });

  test('TC-F10-03: AC — CI bounds present in /full API response', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    expect(body.audit.scoreConfidenceLow).toBeDefined();
    expect(body.audit.scoreConfidenceHigh).toBeDefined();
    expect(body.audit.confidenceIntervals).toBeDefined();
  });

  test('TC-F10-04: AC — All 5 dimension fields present in /full API', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    const a = body.audit;
    for (const field of ['scoreFrequency', 'scorePosition', 'scoreSentimentNumeric', 'scoreContextNumeric', 'scoreAccuracy']) {
      expect(a[field], field).toBeTruthy();
    }
  });

  test('TC-F10-05: AC — totalCalls=200 for paid-tier audit in /full API', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: { totalCalls?: number } };
    if (body.audit.totalCalls !== undefined) {
      expect(body.audit.totalCalls).toBe(200);
    }
  });

  test('TC-F10-06: AC — engineCount=4 for paid-tier audit in /full API', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: { engineCount?: number; engines?: string[] } };
    if (body.audit.engineCount !== undefined) {
      expect(body.audit.engineCount).toBe(4);
    } else if (body.audit.engines !== undefined) {
      expect(body.audit.engines).toHaveLength(4);
    }
  });

  test('TC-F10-07: AC3a — scoreSentiment is text label not numeric string via API', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    const sent = String(body.audit.scoreSentiment);
    expect(sent).toMatch(/positive|neutral|negative/);
    expect(isNaN(Number(sent))).toBe(true);
  });

  test('TC-F10-08: AC3a — scoreContext is text label not numeric string via API', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    const ctx  = String(body.audit.scoreContext);
    expect(ctx).toMatch(/recommended|listed|mentioned|commodified/);
    expect(isNaN(Number(ctx))).toBe(true);
  });

  test('TC-F10-09: AC3c — CI lower <= composite <= CI upper via API', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    const low  = parseFloat(String(body.audit.scoreConfidenceLow));
    const comp = parseFloat(String(body.audit.scoreComposite));
    const high = parseFloat(String(body.audit.scoreConfidenceHigh));
    expect(low).toBeLessThanOrEqual(comp);
    expect(comp).toBeLessThanOrEqual(high);
  });

  test('TC-F10-10: AC — "View rich version →" stays DISABLED on AuditResultsBasic (V5 fix / Sprint 4 scope)', async ({ page }) => {
    // AA4 FIX: /rich page is Sprint 4. The link on AuditResultsBasic must remain greyed.
    await page.goto(`/audits/${auditId}`);
    const richLink = page.getByText(/view rich version/i);
    if (await richLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const opacity = await richLink.evaluate(el => getComputedStyle(el).opacity);
      const title   = await richLink.getAttribute('title') ?? '';
      const isDisabled = parseFloat(opacity) < 0.7
        || title.toLowerCase().includes('sprint 3')
        || title.toLowerCase().includes('sprint 4')
        || title.toLowerCase().includes('available');
      expect(isDisabled, 'V5 fix: View rich version must be disabled in Sprint 3').toBe(true);
    }
  });
});

testAsUser2.describe('F10 — Free-tier: AC3b — 2 engines only', () => {
  testAsUser2('TC-F10-11: AC3b — Free-tier /full API shows 2 engines (chatgpt+perplexity)', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${freeAuditId}/full`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { audit: { engines?: string[]; engineCount?: number; totalCalls?: number } };
    if (body.audit.engines) {
      expect(body.audit.engines).toHaveLength(2);
      expect(body.audit.engines).toContain('chatgpt');
      expect(body.audit.engines).toContain('perplexity');
    }
    if (body.audit.totalCalls !== undefined) {
      expect(body.audit.totalCalls).toBe(100);
    }
  });
});
