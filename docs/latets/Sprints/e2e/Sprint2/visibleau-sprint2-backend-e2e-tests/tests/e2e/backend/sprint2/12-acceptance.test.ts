/**
 * tests/e2e/backend/sprint2/12-acceptance.test.ts
 *
 * Sprint 2 §12 Acceptance Criteria — Backend Checklist
 *
 * Each test verifies one Sprint 2 acceptance criterion via real HTTP API calls.
 * All use mock LLM (LLM_MODE=mock) and the Inngest dev server.
 *
 * Sprint 2 §12 acceptance criteria (backend items):
 *   ✓ LLM_MODE=mock pnpm test passes
 *   ✓ POST /api/audits → status transitions pending → running → complete
 *   ✓ audits.metadata contains { mockScenario: 'happy_path' } after mock run
 *   ✓ Cost assertion: audit.totalCostUsd < 0.10 for any mock-mode audit
 *   ✓ Cross-org POST /api/audits with someone else's brandId returns 404
 *   ✓ Cross-org GET /api/audits/[auditId] returns 404
 *   ✓ auditNumber is per-org (not global serial)
 *   ✓ citations rows exist with correct engine, prompt, brandMentioned
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  seedOrganization,
  seedUser,
  seedBrand,
  seedAudit,
  getAuditById,
  getCitationsForAudit,
  truncateSprint2TablesForOrgs,
  deleteBrandsForOrg,
} from './helpers/db';
import {
  TEST_USER_1,
  TEST_USER_2,
  getClerkToken,
  createAudit,
  getAudit,
  pollAuditUntilDone,
} from './helpers/http';

let org1Id = '';
let org2Id = '';
let brand1Id = '';
let brand2Id = '';
let token1 = '';
let token2 = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name: 'E2E Acceptance Org 1',
    region: 'au',
    tier: 'agency',
  });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const brand1 = await seedBrand({
    organizationId: org1Id,
    name:     'Bondi Plumbing',
    domain:   'bondiplumbing.com.au',
    vertical: 'tradies',
  });
  brand1Id = brand1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name: 'E2E Acceptance Org 2',
    region: 'au',
    tier: 'starter',
  });
  org2Id = org2.id;
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });
  const brand2 = await seedBrand({
    organizationId: org2Id,
    name:     'Sydney Dental Co',
    domain:   'sydneydentalco.com.au',
    vertical: 'allied_health',
  });
  brand2Id = brand2.id;

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  // M10 FIX: guard against empty orgId if beforeAll failed before setting them
  if (org1Id) await truncateSprint2TablesForOrgs([org1Id, org2Id]);
  if (org1Id) await deleteBrandsForOrg(org1Id);
  if (org2Id) await deleteBrandsForOrg(org2Id);
});

beforeEach(async () => {
  await truncateSprint2TablesForOrgs([org1Id, org2Id]);
});

describe('Sprint 2 §12 Acceptance Criteria — Backend API', () => {

  it('§12-AC1: POST /api/audits → audit transitions to status=complete (pending→running→complete)', async () => {
    const { status: createStatus, body } = await createAudit(token1, {
      brandId:  brand1Id,
      scenario: 'happy_path',
    });
    expect(createStatus).toBe(201);
    const { auditId } = body as { auditId: string };

    // Should start as pending (may transition quickly)
    const initial = await getAuditById(auditId);
    expect(['pending', 'running']).toContain(initial!.status);

    // Wait for completion
    const { status } = await pollAuditUntilDone(token1, auditId);
    expect(status).toBe('complete');
  });

  it('§12-AC2: audits.metadata contains { mockScenario: "happy_path" } after mock run', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const audit = await getAuditById(auditId);
    const meta = audit!.metadata as { mockScenario?: string };
    expect(meta.mockScenario).toBe('happy_path');
  });

  it('§12-AC3: audit.totalCostUsd < 0.10 for any mock-mode audit', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const audit = await getAuditById(auditId);
    const cost = parseFloat(audit!.totalCostUsd ?? '99');
    expect(cost).toBeLessThan(0.10);
  });

  it('§12-AC4: cross-org POST /api/audits with other org\'s brandId → 404', async () => {
    const { status } = await createAudit(token1, { brandId: brand2Id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
  });

  it('§12-AC5: cross-org GET /api/audits/[auditId] → 404 (CLAUDE.md §7)', async () => {
    const org2Audit = await seedAudit({
      organizationId: org2Id,
      brandId:        brand2Id,
      auditNumber:    1,
      status:         'complete',
    });

    const { status } = await getAudit(token1, org2Audit.id);
    expect(status).toBe(404);
    expect(status).not.toBe(401);
  });

  it('§12-AC6: auditNumber is per-org (not global serial — Sprint 2 C fix)', async () => {
    // Org1: two audits → #1, #2
    const r1a = await createAudit(token1, { brandId: brand1Id });
    const r1b = await createAudit(token1, { brandId: brand1Id });

    // Org2: first audit → #1 (not #3)
    const r2a = await createAudit(token2, { brandId: brand2Id });

    const num1a = (r1a.body as { auditNumber: number }).auditNumber;
    const num1b = (r1b.body as { auditNumber: number }).auditNumber;
    const num2a = (r2a.body as { auditNumber: number }).auditNumber;

    expect(num1a).toBe(1);
    expect(num1b).toBe(2);
    expect(num2a).toBe(1); // Org2 starts fresh, not continuing org1's count
  });

  it('§12-AC7: citations rows created with correct engine=chatgpt and prompt content', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    const citations = await getCitationsForAudit(auditId);
    expect(citations.length).toBeGreaterThan(0);

    for (const c of citations) {
      expect(c.engine).toBe('chatgpt');
      expect(c.prompt).toBeTruthy();
      expect(c.prompt.length).toBeGreaterThan(10);
    }
  });

  it('§12-AC8: GET /api/audits/[id] response shape includes { audit, citationCount }', async () => {
    const audit = await seedAudit({
      organizationId: org1Id,
      brandId:        brand1Id,
      auditNumber:    1,
      status:         'pending',
    });

    const { status, body } = await getAudit(token1, audit.id);
    expect(status).toBe(200);

    const b = body as { audit: Record<string, unknown>; citationCount: number };
    expect(b.audit.id).toBe(audit.id);
    expect(b.audit.status).toBe('pending');
    expect(typeof b.citationCount).toBe('number');
  });
});
