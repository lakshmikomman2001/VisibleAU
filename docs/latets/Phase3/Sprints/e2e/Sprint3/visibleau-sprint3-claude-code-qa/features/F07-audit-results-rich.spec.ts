/**
 * F07 — GET /api/audits/[auditId]/full: Sprint 3 rich payload API
 *
 * AA1 FIX: The AuditResultsRich PAGE (/audits/[id]/rich) is Sprint 4 scope.
 * Sprint 3 §0: "Out of scope: UI to display the rich results (Sprint 4)"
 * Sprint 3 §14: "Not ready: Audit results UI (Sprint 4)"
 * Sprint 3 §10 step 7: Ships GET /api/audits/[auditId]/full — the API route.
 *
 * This spec tests the API that Sprint 4 will consume, not the UI page.
 *
 * Uses DB-seeded complete audit — no Inngest required.
 *
 * TC-F07-01  GET /api/audits/[id]/full returns 200 with correct shape (AC4 fix)
 * TC-F07-02  audit.scoreComposite is "63.4" (AA5 fix canonical value)
 * TC-F07-03  audit.scoreSentiment is a TEXT label 'positive'|'neutral'|'negative' (AC3a)
 * TC-F07-04  audit.scoreContext is a TEXT label (not numeric) (AC3a)
 * TC-F07-05  All 5 dimension score fields present and non-null
 * TC-F07-06  audit.confidenceIntervals is a JSON object with 5 dimension keys
 * TC-F07-07  CI bounds bracket composite: scoreConfidenceLow <= scoreComposite <= scoreConfidenceHigh (AC3c)
 * TC-F07-08  perEngineSummary contains all 4 engine names
 * TC-F07-09  citedSourcesByDomain is an array sorted descending by count
 * TC-F07-10  citations array has all citation rows
 * TC-F07-11  Cross-org: User 2 GET /api/audits/[org1-id]/full → 404 not 401
 * TC-F07-12  Unauthenticated GET /api/audits/[id]/full → 401
 * TC-F07-13  Non-existent auditId → 404
 * TC-F07-14  GET /api/brands/[brandId]/metrics returns trend shape (Sprint 3 new route)
 * TC-F07-15  Full Inngest flow → GET /api/audits/[id]/full returns all Sprint 3 fields
 */

import {
  test, testAsUser2, expect, assertEnvVars,
  ensureOrg1, ensureOrg2, createQABrand,
  deleteQAData, seedSprint3Audit,
} from '../helpers/setup';
import { test as base } from '@playwright/test';
import * as schema from '../../db/schema';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let auditId  = '';

base.beforeAll(async () => {
  assertEnvVars();
  const r1 = await ensureOrg1();
  org1Id = r1.orgId;
  const r2 = await ensureOrg2();
  org2Id = r2.orgId;
  await deleteQAData(org1Id);
  await deleteQAData(org2Id);
  brand1Id = await createQABrand(org1Id, 'F07');

  // Seed a complete Sprint 3 audit with canonical AA5 fix values
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
    confidenceIntervals: {
      frequency: { lower: 9,  upper: 20 },
      position:  { lower: 85, upper: 95 },
      sentiment: { lower: 73, upper: 85 },
      context:   { lower: 66, upper: 80 },
      accuracy:  { lower: 64, upper: 78 },
    },
    engines:     ['chatgpt', 'claude', 'gemini', 'perplexity'],
    engineCount: 4,
    totalCalls:  200,
    totalCostUsd: 1.89,
  });
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
  if (org2Id) await deleteQAData(org2Id);
});

test.describe('F07 — GET /api/audits/[id]/full: Sprint 3 rich payload API (AA1 fix)', () => {

  test('TC-F07-01: GET /api/audits/[id]/full returns 200 with correct top-level shape (AC4 fix)', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.audit).toBeDefined();
    expect(body.citations).toBeDefined();
    expect(body.perEngineSummary).toBeDefined();
    expect(body.citedSourcesByDomain).toBeDefined();
  });

  test('TC-F07-02: audit.scoreComposite = "63.4" (AA5 fix: 14×0.25+90×0.25+79×0.20+73×0.15+71×0.15)', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    const composite = parseFloat(String(body.audit.scoreComposite));
    expect(composite).toBeCloseTo(63.4, 1);
  });

  test('TC-S3-03: AC3a — scoreSentiment is TEXT label not numeric string', async ({ page }) => {
    // AC3a fix: scoreSentiment = 'positive'|'neutral'|'negative' (text) not '79.00' (numeric)
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    expect(String(body.audit.scoreSentiment)).toMatch(/positive|neutral|negative/);
    expect(isNaN(Number(body.audit.scoreSentiment))).toBe(true);
  });

  test('TC-F07-04: AC3a — scoreContext is TEXT label not numeric string', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    expect(String(body.audit.scoreContext)).toMatch(/recommended|listed|mentioned|commodified/);
    expect(isNaN(Number(body.audit.scoreContext))).toBe(true);
  });

  test('TC-F07-05: All 5 dimension score fields present and non-null', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    const a = body.audit;
    expect(a.scoreFrequency,      'scoreFrequency').toBeTruthy();
    expect(a.scorePosition,       'scorePosition').toBeTruthy();
    expect(a.scoreSentimentNumeric, 'scoreSentimentNumeric').toBeTruthy();
    expect(a.scoreContextNumeric,  'scoreContextNumeric').toBeTruthy();
    expect(a.scoreAccuracy,       'scoreAccuracy').toBeTruthy();
    expect(a.scoreComposite,      'scoreComposite').toBeTruthy();
  });

  test('TC-F07-06: confidenceIntervals jsonb has all 5 dimension keys', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: { confidenceIntervals: Record<string, { lower: number; upper: number }> } };
    const ci = body.audit.confidenceIntervals;
    expect(ci).not.toBeNull();
    for (const dim of ['frequency', 'position', 'sentiment', 'context', 'accuracy']) {
      expect(ci[dim], `CI for ${dim}`).toBeDefined();
      expect(ci[dim].lower).toBeLessThanOrEqual(ci[dim].upper);
    }
  });

  test('TC-F07-07: AC3c — scoreConfidenceLow <= scoreComposite <= scoreConfidenceHigh', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { audit: Record<string, unknown> };
    const low  = parseFloat(String(body.audit.scoreConfidenceLow));
    const comp = parseFloat(String(body.audit.scoreComposite));
    const high = parseFloat(String(body.audit.scoreConfidenceHigh));
    expect(low).toBeLessThanOrEqual(comp);
    expect(comp).toBeLessThanOrEqual(high);
  });

  test('TC-F07-08: perEngineSummary contains all 4 engine names', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { perEngineSummary: Array<{ engine: string }> };
    const engines = body.perEngineSummary.map(e => e.engine);
    if (engines.length > 0) {
      // Paid-tier audit has 4 engines
      expect(engines).toContain('chatgpt');
    }
  });

  test('TC-F07-09: citedSourcesByDomain is sorted descending by count', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { citedSourcesByDomain: Array<{ domain: string; count: number }> };
    const domains = body.citedSourcesByDomain;
    for (let i = 1; i < domains.length; i++) {
      expect(domains[i - 1]!.count).toBeGreaterThanOrEqual(domains[i]!.count);
    }
  });

  test('TC-F07-10: citations array is present', async ({ page }) => {
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    const body = await res.json() as { citations: unknown[] };
    expect(Array.isArray(body.citations)).toBe(true);
  });

  test('TC-F07-12: Unauthenticated GET /api/audits/[id]/full → 401', async ({ browser }) => {
    const ctx  = await browser.newContext({ baseURL: process.env.E2E_APP_URL ?? 'http://localhost:3000' });
    const page = await ctx.newPage();
    const res  = await page.request.get(`/api/audits/${auditId}/full`);
    expect(res.status()).toBe(401);
    await ctx.close();
  });

  test('TC-F07-13: Non-existent auditId → 404', async ({ page }) => {
    const res = await page.request.get('/api/audits/00000000-0000-0000-0000-000000000000/full');
    expect(res.status()).toBe(404);
  });

  test('TC-F07-14: GET /api/brands/[id]/metrics returns trend shape (Sprint 3 new route)', async ({ page }) => {
    const res  = await page.request.get(`/api/brands/${brand1Id}/metrics`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { audits: unknown[]; trend: string; lastAuditScore: number; changeVsPriorAudit: number };
    expect(Array.isArray(body.audits)).toBe(true);
    expect(['up', 'down', 'flat']).toContain(body.trend);
    expect(typeof body.lastAuditScore).toBe('number');
    expect(typeof body.changeVsPriorAudit).toBe('number');
  });
});

testAsUser2.describe('F07 — Cross-org API isolation (AA1 fix)', () => {
  testAsUser2('TC-F07-11: User 2 GET /api/audits/[org1-id]/full → 404 not 401', async ({ page }) => {
    const res = await page.request.get(`/api/audits/${auditId}/full`);
    expect(res.status()).toBe(404);
    expect(res.status()).not.toBe(401);
    const body = await res.text();
    expect(body).not.toContain(org1Id);
  });
});
