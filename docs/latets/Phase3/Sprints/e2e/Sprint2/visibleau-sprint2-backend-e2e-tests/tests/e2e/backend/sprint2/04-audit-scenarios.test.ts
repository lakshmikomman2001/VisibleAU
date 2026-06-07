/**
 * tests/e2e/backend/sprint2/04-audit-scenarios.test.ts
 *
 * Backend E2E: Sprint 2 mock scenarios
 *
 * Sprint 2 §6 specifies 4 canonical mock scenarios.
 * This file tests the 3 non-happy-path scenarios:
 *
 *   no_mention:       All 10 calls respond without mentioning the brand.
 *                     scoreComposite = 0. All citations brandMentioned=false.
 *
 *   partial_failure:  ~4 of 10 calls fail (mock error). ~6 succeed.
 *                     Audit still completes (failed calls → null → continue).
 *                     citationCount < 10. cost < happy_path cost.
 *
 *   rate_limited:     First call throws 429. Inngest step.run retries.
 *                     After retry, all calls succeed. status=complete.
 *
 * Sprint 2 §13 anti-pattern: do NOT invent new scenarios — only these 4.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  seedOrganization,
  seedUser,
  seedBrand,
  getAuditById,
  getCitationsForAudit,
  truncateSprint2TablesForOrgs,
  deleteBrandsForOrg,
} from './helpers/db';
import {
  TEST_USER_1,
  getClerkToken,
  createAudit,
  pollAuditUntilDone,
} from './helpers/http';

let org1Id = '';
let brand1Id = '';
let token1 = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name: 'E2E Audit Scenarios Org',
    region: 'au',
    tier: 'agency',
  });
  org1Id = org1.id;
  await seedUser({
    clerkUserId: TEST_USER_1.clerkUserId,
    organizationId: org1Id,
    email: TEST_USER_1.email,
  });

  const brand1 = await seedBrand({
    organizationId: org1Id,
    name:     'Bondi Plumbing',
    domain:   'bondiplumbing.com.au',
    vertical: 'tradies',
  });
  brand1Id = brand1.id;

  token1 = await getClerkToken(TEST_USER_1);
});

afterAll(async () => {
  // M10 FIX: guard against empty orgId if beforeAll failed before setting it
  if (org1Id) await truncateSprint2TablesForOrgs([org1Id]);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

beforeEach(async () => {
  await truncateSprint2TablesForOrgs([org1Id]);
});

describe('Mock scenario: no_mention', () => {

  it('TC-S2-40: no_mention — status=complete, all citations brandMentioned=false', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'no_mention' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const citations = await getCitationsForAudit(auditId);
    expect(citations.length).toBe(10);
    expect(citations.every((c) => !c.brandMentioned)).toBe(true);
  });

  it('TC-S2-41: no_mention — scoreComposite = 0 (no mentions → 0/10 × 100)', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'no_mention' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const audit = await getAuditById(auditId);
    expect(parseFloat(audit!.scoreComposite!)).toBe(0);
  });

  it('TC-S2-42: no_mention — audit.status = complete (not failed)', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'no_mention' });
    const { auditId } = body as { auditId: string };
    const { status } = await pollAuditUntilDone(token1, auditId);
    expect(status).toBe('complete');
  });
});

describe('Mock scenario: partial_failure', () => {

  it('TC-S2-43: partial_failure — status=complete (failed calls are skipped, not fatal)', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'partial_failure' });
    const { auditId } = body as { auditId: string };
    const { status } = await pollAuditUntilDone(token1, auditId);
    expect(status).toBe('complete');
  });

  it('TC-S2-44: partial_failure — citationCount < 10 (failed calls produce no citations)', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'partial_failure' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const citations = await getCitationsForAudit(auditId);
    // ~40% failure rate = ~4 failed → ~6 citations
    expect(citations.length).toBeGreaterThanOrEqual(4);
    expect(citations.length).toBeLessThan(10);
  });

  it('TC-S2-45: partial_failure — cost < happy_path cost (fewer successful calls)', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'partial_failure' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const audit = await getAuditById(auditId);
    // Partial failure = fewer completed calls → lower cost than full 10-call run
    expect(parseFloat(audit!.totalCostUsd ?? '0')).toBeLessThan(0.10);
  });
});

describe('Mock scenario: rate_limited', () => {

  it('TC-S2-46: rate_limited — status=complete (Inngest retry recovers from first-call 429)', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'rate_limited' });
    const { auditId } = body as { auditId: string };

    // rate_limited scenario: first call throws 429, retry succeeds
    // Allow extra time for the retry
    const { status } = await pollAuditUntilDone(token1, auditId, 60_000);
    expect(status).toBe('complete');
  });

  it('TC-S2-47: rate_limited — status is not stuck at running or pending after completion', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'rate_limited' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId, 60_000);

    const audit = await getAuditById(auditId);
    expect(audit!.status).not.toBe('running');
    expect(audit!.status).not.toBe('pending');
  });
});
