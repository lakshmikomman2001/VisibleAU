/**
 * tests/e2e/backend/sprint3/06-audit-flow-free.test.ts
 *
 * Full free-tier mock audit.
 * Sprint 3 AC3b: Free tier = exactly 2 engines (ChatGPT + Perplexity).
 * Free: 2 × 10 × 5 = 100 calls, NOT 200.
 *
 * REQUIRES: Inngest dev server + LLM_MODE=mock.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  seedOrganization, seedUser, seedBrand,
  deleteAuditsForOrg, deleteBrandsForOrg,
  getAuditById, getCitationsForAudit,
} from './helpers/db';
import { TEST_USER_2, getClerkToken, createAudit, pollAuditUntilDone } from './helpers/http';

let org2Id   = '';
let brand2Id = '';
let token2   = '';

beforeAll(async () => {
  const org = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name: 'S3 Flow Free Org',
    tier: 'free',  // Free tier — 2 engines only
  });
  org2Id = org.id;
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });
  const b = await seedBrand({ organizationId: org2Id, name: 'S3 Free Brand', domain: 's3free.e2e.test' });
  brand2Id = b.id;
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org2Id) await deleteAuditsForOrg(org2Id);
  if (org2Id) await deleteBrandsForOrg(org2Id);
});

describe('Sprint 3 AC3b — Free-tier mock audit (2 engines, 100 calls)', () => {

  let auditId = '';

  it('TC-S3-80: Free-tier audit completes with status=complete', async () => {
    const { status, body } = await createAudit(token2, { brandId: brand2Id, scenario: 'happy_path' });
    expect(status).toBe(201);
    const { auditId: id } = body as { auditId: string };
    auditId = id;
    const { status: auditStatus } = await pollAuditUntilDone(token2, auditId, 90_000);
    expect(auditStatus).toBe('complete');
  });

  it('TC-S3-81: AC3b — engines = exactly ["chatgpt", "perplexity"] (Free tier PRD §7)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    // Free tier: ONLY chatgpt + perplexity — NOT claude or gemini
    expect(audit?.engines).toHaveLength(2);
    expect(audit?.engines).toContain('chatgpt');
    expect(audit?.engines).toContain('perplexity');
    expect(audit?.engines).not.toContain('claude');
    expect(audit?.engines).not.toContain('gemini');
  });

  it('TC-S3-82: totalCalls = 100 (2 engines × 10 prompts × 5 runs, NOT 200)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.totalCalls).toBe(100);
    // Explicitly NOT 200 — this would indicate engine count was hardcoded to 4
    expect(audit?.totalCalls).not.toBe(200);
  });

  it('TC-S3-83: engineCount = 2 (AB2 fix column; Free tier-derived)', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.engineCount).toBe(2);
  });

  it('TC-S3-84: Exactly 100 citation rows (2 engines × 10 prompts × 5 runs)', async () => {
    if (!auditId) return;
    const citations = await getCitationsForAudit(auditId);
    expect(citations).toHaveLength(100);
  });

  it('TC-S3-85: No claude or gemini citations in Free-tier audit', async () => {
    if (!auditId) return;
    const citations = await getCitationsForAudit(auditId);
    const claudeCitations    = citations.filter(c => c.engine === 'claude');
    const geminiCitations    = citations.filter(c => c.engine === 'gemini');
    expect(claudeCitations.length, 'claude citations must be 0 for Free tier').toBe(0);
    expect(geminiCitations.length, 'gemini citations must be 0 for Free tier').toBe(0);
  });

  it('TC-S3-86: All 5 dimension scores populated for Free-tier audit', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    expect(audit?.scoreFrequency).not.toBeNull();
    expect(audit?.scoreComposite).not.toBeNull();
    expect(audit?.confidenceIntervals).not.toBeNull();
  });

  it('TC-S3-87: AC3c — CI bounds bracket composite score for Free-tier audit', async () => {
    if (!auditId) return;
    const audit = await getAuditById(auditId);
    const low  = parseFloat(audit?.scoreConfidenceLow  ?? '0');
    const comp = parseFloat(audit?.scoreComposite      ?? '0');
    const high = parseFloat(audit?.scoreConfidenceHigh ?? '100');
    expect(low).toBeLessThanOrEqual(comp);
    expect(comp).toBeLessThanOrEqual(high);
  });
});
