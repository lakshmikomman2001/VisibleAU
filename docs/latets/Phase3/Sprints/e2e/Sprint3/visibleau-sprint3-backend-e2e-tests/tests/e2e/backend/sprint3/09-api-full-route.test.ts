/**
 * tests/e2e/backend/sprint3/09-api-full-route.test.ts
 *
 * Sprint 3 §9: GET /api/audits/[auditId]/full — rich payload response shape.
 * AC4 fix: field names now explicit. Tests RLS isolation (CLAUDE.md §7 → 404).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  testDb, seedOrganization, seedUser, seedBrand,
  seedSprint3Audit, deleteAuditsForOrg, deleteBrandsForOrg,
} from './helpers/db';
import * as schema from '../../../../db/schema';
import { TEST_USER_1, TEST_USER_2, getClerkToken, getAuditFull, get } from './helpers/http';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let auditId  = '';
let token1   = '';
let token2   = '';

beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: TEST_USER_1.clerkOrgId, name: 'S3 Full Org1', tier: 'agency' });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const b1 = await seedBrand({ organizationId: org1Id, name: 'S3 Full Brand', domain: 's3full.e2e.test' });
  brand1Id = b1.id;

  const org2 = await seedOrganization({ clerkOrgId: TEST_USER_2.clerkOrgId, name: 'S3 Full Org2', tier: 'free' });
  org2Id = org2.id;
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  const audit = await seedSprint3Audit({
    organizationId:   org1Id,
    brandId:          brand1Id,
    auditNumber:      1,
    scoreFrequency:   14,
    scorePosition:    90,
    scoreSentiment:   'positive',
    scoreSentimentNumeric: 79,
    scoreContext:     'recommended',
    scoreContextNumeric: 73,
    scoreAccuracy:    71,
    scoreComposite:   63.4,
    scoreConfidenceLow: 50,
    scoreConfidenceHigh: 75,
  });
  auditId = audit.id;

  // Seed a few citations
  await testDb.insert(schema.citations).values([
    { auditId, engine: 'chatgpt', prompt: 'Best plumbers in Bondi?', runNumber: 1,
      brandMentioned: true, position: 1, responseSnippet: 'Bondi Plumbing is excellent.',
      sentimentLabel: 'positive', contextLabel: 'recommended',
      citedSources: [{ domain: 'bondiplumbing.e2e.test', url: 'https://bondiplumbing.e2e.test' }] as any,
      contextSnippets: [] as any, llmCostUsd: '0.0050', llmModel: 'gpt-4o' },
    { auditId, engine: 'claude', prompt: 'Best plumbers in Bondi?', runNumber: 1,
      brandMentioned: false, position: null, responseSnippet: null,
      citedSources: [] as any, contextSnippets: [] as any,
      llmCostUsd: '0.0030', llmModel: 'claude-3-5-sonnet-20241022' },
  ]);

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org2Id) await deleteAuditsForOrg(org2Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
  if (org2Id) await deleteBrandsForOrg(org2Id);
});

describe('GET /api/audits/[auditId]/full — Sprint 3 §9', () => {

  it('TC-S3-130: returns 200 with correct top-level shape (AC4 fix: explicit field names)', async () => {
    const { status, body } = await getAuditFull(token1, auditId);
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.audit).toBeDefined();
    expect(b.citations).toBeDefined();
    expect(b.perEngineSummary).toBeDefined();
    expect(b.citedSourcesByDomain).toBeDefined();
  });

  it('TC-S3-131: audit object contains all Sprint 3 dimension fields', async () => {
    const { body } = await getAuditFull(token1, auditId);
    const audit = (body as { audit: Record<string, unknown> }).audit;
    // Sprint 2 fields still present
    expect(audit.id).toBe(auditId);
    expect(audit.scoreComposite).toBeDefined();
    // Sprint 3 new fields (AC4 fix — explicitly named)
    expect(audit.scoreFrequency).toBeDefined();
    expect(audit.scorePosition).toBeDefined();
    expect(audit.scoreSentiment).toBeDefined();       // TEXT label
    expect(audit.scoreSentimentNumeric).toBeDefined();
    expect(audit.scoreContext).toBeDefined();          // TEXT label
    expect(audit.scoreContextNumeric).toBeDefined();
    expect(audit.scoreAccuracy).toBeDefined();
    expect(audit.scoreConfidenceLow).toBeDefined();
    expect(audit.scoreConfidenceHigh).toBeDefined();
    expect(audit.confidenceIntervals).toBeDefined();
    expect(audit.engineCount).toBeDefined();
    expect(audit.promptCount).toBeDefined();
  });

  it('TC-S3-132: citations array contains all citation rows', async () => {
    const { body } = await getAuditFull(token1, auditId);
    const citations = (body as { citations: unknown[] }).citations;
    expect(citations.length).toBeGreaterThanOrEqual(2);
  });

  it('TC-S3-133: perEngineSummary is an array with per-engine breakdown', async () => {
    const { body } = await getAuditFull(token1, auditId);
    const summary = (body as { perEngineSummary: unknown[] }).perEngineSummary;
    expect(Array.isArray(summary)).toBe(true);
    if (summary.length > 0) {
      const item = summary[0] as Record<string, unknown>;
      expect(item.engine).toBeDefined();
      expect(typeof item.mentionRate).toBe('number');
    }
  });

  it('TC-S3-134: citedSourcesByDomain is sorted by count descending', async () => {
    const { body } = await getAuditFull(token1, auditId);
    const domains = (body as { citedSourcesByDomain: Array<{ domain: string; count: number }> }).citedSourcesByDomain;
    for (let i = 1; i < domains.length; i++) {
      expect(domains[i - 1]!.count).toBeGreaterThanOrEqual(domains[i]!.count);
    }
  });

  it('TC-S3-135: 401 without auth', async () => {
    const { status } = await get(`/api/audits/${auditId}/full`, undefined);
    expect(status).toBe(401);
  });

  it('TC-S3-136: cross-org returns 404 not 401 (CLAUDE.md §7)', async () => {
    const { status, body } = await getAuditFull(token2, auditId);
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    expect(JSON.stringify(body)).not.toContain(org1Id);
  });

  it('TC-S3-137: non-existent auditId returns 404', async () => {
    const { status } = await getAuditFull(token1, '00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
  });
});
