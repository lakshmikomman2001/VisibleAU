/**
 * tests/e2e/backend/sprint3/05-audit-flow-paid.test.ts
 *
 * Full paid-tier (agency) mock audit flow.
 * Sprint 3 §12 acceptance — 200 LLM calls, 5-dimension scoring, CI bands.
 *
 * REQUIRES: Inngest dev server + LLM_MODE=mock + all 4 engine fixtures.
 * Timeout: 120s (4 engines × 10 prompts × 5 runs = 200 mock calls).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  seedOrganization, seedUser, seedBrand,
  deleteAuditsForOrg, deleteBrandsForOrg,
  getAuditById, getCitationsForAudit,
} from './helpers/db';
import { TEST_USER_1, getClerkToken, createAudit, pollAuditUntilDone } from './helpers/http';

let org1Id   = '';
let brand1Id = '';
let token1   = '';

beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: TEST_USER_1.clerkOrgId, name: 'S3 Flow Paid Org', tier: 'agency' });
  org1Id = org.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const b = await seedBrand({ organizationId: org1Id, name: 'S3 Paid Brand', domain: 's3paid.e2e.test' });
  brand1Id = b.id;
  token1 = await getClerkToken(TEST_USER_1);
});

afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

describe('Sprint 3 §12 — Full paid-tier mock audit (200 calls)', () => {

  let auditId = '';

  it('TC-S3-60: happy_path paid audit completes with status=complete', async () => {
    const { status, body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    expect(status).toBe(201);
    const { auditId: id } = body as { auditId: string };
    auditId = id;
    const { status: auditStatus } = await pollAuditUntilDone(token1, auditId, 120_000);
    expect(auditStatus).toBe('complete');
  });

  it('TC-S3-61: engines = all 4 (agency tier via enginesForTier)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.engines).toHaveLength(4);
    expect(audit?.engines).toContain('chatgpt');
    expect(audit?.engines).toContain('claude');
    expect(audit?.engines).toContain('gemini');
    expect(audit?.engines).toContain('perplexity');
  });

  it('TC-S3-62: totalCalls = 200 (4 engines × 10 prompts × 5 runs)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.totalCalls).toBe(200);
  });

  it('TC-S3-63: runsPerPrompt = 5, promptsCount = 10', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.runsPerPrompt).toBe(5);
    expect(audit?.promptsCount).toBe(10);
  });

  it('TC-S3-64: engineCount = 4, promptCount = 10 (AB2 fix: new columns)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.engineCount).toBe(4);
    expect(audit?.promptCount).toBe(10);
  });

  it('TC-S3-65: 200 citation rows created (one per LLM call)', async () => {
    if (!auditId) return;
    const citations = await getCitationsForAudit(auditId);
    expect(citations).toHaveLength(200);
  });

  it('TC-S3-66: All 5 dimension scores are set (not null)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.scoreFrequency,      'scoreFrequency').not.toBeNull();
    expect(audit?.scorePosition,       'scorePosition').not.toBeNull();
    expect(audit?.scoreSentimentNumeric, 'scoreSentimentNumeric').not.toBeNull();
    expect(audit?.scoreContextNumeric,   'scoreContextNumeric').not.toBeNull();
    expect(audit?.scoreAccuracy,         'scoreAccuracy').not.toBeNull();
    expect(audit?.scoreComposite,        'scoreComposite').not.toBeNull();
  });

  it('TC-S3-67: AC3a — scoreSentiment is a text label (positive|neutral|negative)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    const validLabels = ['positive', 'neutral', 'negative'];
    expect(validLabels).toContain(audit?.scoreSentiment);
    // NOT a number — this would be the AB1 regression
    expect(typeof audit?.scoreSentiment).toBe('string');
  });

  it('TC-S3-68: AC3a — scoreContext is a text label (recommended|listed|mentioned|commodified)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    const validLabels = ['recommended', 'listed', 'mentioned', 'commodified'];
    expect(validLabels).toContain(audit?.scoreContext);
    expect(typeof audit?.scoreContext).toBe('string');
  });

  it('TC-S3-69: AC3c — scoreConfidenceLow ≤ scoreComposite ≤ scoreConfidenceHigh', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    const low  = parseFloat(audit?.scoreConfidenceLow  ?? '0');
    const comp = parseFloat(audit?.scoreComposite      ?? '0');
    const high = parseFloat(audit?.scoreConfidenceHigh ?? '100');
    expect(low).toBeLessThanOrEqual(comp);
    expect(comp).toBeLessThanOrEqual(high);
  });

  it('TC-S3-70: confidenceIntervals jsonb has all 5 dimension CI objects', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    const ci = audit?.confidenceIntervals as Record<string, { lower: number; upper: number }> | null;
    expect(ci).not.toBeNull();
    for (const dim of ['frequency', 'position', 'sentiment', 'context', 'accuracy']) {
      expect(ci?.[dim], `CI for ${dim}`).toBeDefined();
      expect(typeof ci?.[dim].lower).toBe('number');
      expect(typeof ci?.[dim].upper).toBe('number');
      expect(ci![dim].lower).toBeLessThanOrEqual(ci![dim].upper);
    }
  });

  it('TC-S3-71: scoreFrequency 0-100 range is valid', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    const freq = parseFloat(audit?.scoreFrequency ?? '-1');
    expect(freq).toBeGreaterThanOrEqual(0);
    expect(freq).toBeLessThanOrEqual(100);
  });

  it('TC-S3-72: totalCostUsd is set (mock cost is low but populated)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.totalCostUsd).not.toBeNull();
    // Mock cost: each fixture call has 0.002-0.007 → 200 calls ≈ $0.40-$1.40 mock
    // But per §12 acceptance: real LLM < $4.00; mock should be < $4.00 too
    const cost = parseFloat(audit?.totalCostUsd ?? '0');
    expect(cost).toBeLessThan(4.00);
  });
});
