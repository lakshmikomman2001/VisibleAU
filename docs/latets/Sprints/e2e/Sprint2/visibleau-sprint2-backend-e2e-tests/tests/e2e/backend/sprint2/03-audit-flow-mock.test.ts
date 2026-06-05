/**
 * tests/e2e/backend/sprint2/03-audit-flow-mock.test.ts
 *
 * Backend E2E: Full audit flow — happy_path mock scenario
 *
 * Sprint 2 §12 acceptance criteria (verified end-to-end):
 *   ✓ POST /api/audits → 201 with auditId
 *   ✓ Inngest job runs: status transitions pending → running → complete
 *   ✓ 10 citation rows created (one per prompt)
 *   ✓ At least one brandMentioned=true citation (happy_path fixture)
 *   ✓ audit.scoreComposite is set (mention rate × 100)
 *   ✓ audit.totalCostUsd < 0.10 (Sprint 2 §12 cost assertion)
 *   ✓ audit.metadata.mockScenario = 'happy_path'
 *   ✓ audit.engines = ['chatgpt']
 *   ✓ audit.promptsCount = 10
 *   ✓ audit.completedAt is set
 *
 * REQUIRES: Inngest dev server running (npx inngest-cli@latest dev)
 * REQUIRES: App running in mock mode (LLM_MODE=mock pnpm dev)
 *
 * Times out at 45s — mock LLM is fast but Inngest fan-out adds latency.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  seedOrganization,
  seedUser,
  seedBrand,
  getAuditById,
  getCitationsForAudit,
  truncateSprint2TablesForOrgs,
  truncateLlmCache,
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
    name: 'E2E Audit Flow Org 1',
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
  await truncateLlmCache();
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

beforeEach(async () => {
  await truncateSprint2TablesForOrgs([org1Id]);
});

describe('Full audit flow — happy_path mock scenario', () => {

  it('TC-S2-30: happy_path — status=complete, 10 citations, cost<$0.10 (Sprint 2 §12)', async () => {
    // Create audit
    const { status: createStatus, body: createBody } = await createAudit(token1, {
      brandId:  brand1Id,
      scenario: 'happy_path',
    });
    expect(createStatus).toBe(201);
    const { auditId } = createBody as { auditId: string };

    // Poll until complete
    const { status: auditStatus } = await pollAuditUntilDone(token1, auditId);
    expect(auditStatus).toBe('complete');

    // Verify DB state
    const audit = await getAuditById(auditId);
    expect(audit).not.toBeNull();
    expect(audit!.status).toBe('complete');
    expect(audit!.completedAt).not.toBeNull();
    expect(audit!.engines).toEqual(['chatgpt']);
    expect(audit!.promptsCount).toBe(10);
    expect(audit!.runsPerPrompt).toBe(1);
    expect(audit!.totalCalls).toBe(10);

    // Sprint 2 §12: cost < $0.10
    expect(parseFloat(audit!.totalCostUsd!)).toBeLessThan(0.10);

    // Composite score is set
    expect(audit!.scoreComposite).not.toBeNull();
    const score = parseFloat(audit!.scoreComposite!);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('TC-S2-31: happy_path — exactly 10 citation rows created', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const citations = await getCitationsForAudit(auditId);
    expect(citations).toHaveLength(10);
  });

  it('TC-S2-32: happy_path — at least one citation has brandMentioned=true', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const citations = await getCitationsForAudit(auditId);
    const mentioned = citations.filter((c) => c.brandMentioned);
    expect(mentioned.length).toBeGreaterThan(0);
  });

  it('TC-S2-33: happy_path — audit.metadata.mockScenario = happy_path persisted', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const audit = await getAuditById(auditId);
    const meta = audit!.metadata as { mockScenario?: string };
    expect(meta.mockScenario).toBe('happy_path');
  });

  it('TC-S2-34: happy_path — GET /api/audits/[id] citationCount matches DB count', async () => {
    const { body: createBody } = await createAudit(token1, {
      brandId: brand1Id,
      scenario: 'happy_path',
    });
    const { auditId } = createBody as { auditId: string };
    const { body: auditBody } = await pollAuditUntilDone(token1, auditId);

    const apiCitationCount = (auditBody as { audit: { status: string }; citationCount: number }).citationCount;
    const dbCitations = await getCitationsForAudit(auditId);
    expect(apiCitationCount).toBe(dbCitations.length);
  });

  it('TC-S2-35: happy_path — scoreComposite = (mentionedCount / 10) × 100', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const audit = await getAuditById(auditId);
    const citations = await getCitationsForAudit(auditId);
    const mentionedCount = citations.filter((c) => c.brandMentioned).length;
    const expectedScore = (mentionedCount / 10) * 100;

    expect(parseFloat(audit!.scoreComposite!)).toBeCloseTo(expectedScore, 1);
  });
});
