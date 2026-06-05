/**
 * tests/e2e/backend/sprint2/01-audit-create.test.ts
 *
 * Backend E2E: POST /api/audits
 *
 * Sprint 2 §9 spec:
 *   - Auth required; 401 if unauthenticated
 *   - Body: { brandId, scenario?: MockScenario }
 *   - Verifies brand belongs to current org → 404 if not (CLAUDE.md §7)
 *   - Creates audit row with status='pending', triggeredBy='manual'
 *   - auditNumber is per-org sequential (C fix: NOT serial())
 *   - Returns 201 + { auditId, auditNumber }
 *   - Sends audit.run Inngest event
 *
 * Test data: seeded via testDb (service-role) before each test.
 * Teardown: truncateSprint2Tables in afterEach + afterAll.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'; // N1 FIX: removed unused afterEach
import {
  seedOrganization,
  seedUser,
  seedBrand,
  getAuditById,
  truncateSprint2TablesForOrgs,
  deleteBrandsForOrg,
} from './helpers/db';
import {
  TEST_USER_1,
  TEST_USER_2,
  getClerkToken,
  createAudit,
  post,
} from './helpers/http';
// J18 FIX: removed unused 'import * as schema' — schema.XXX is never referenced
// in this file; all DB operations go through helpers/db.ts abstractions.

let org1Id = '';
let org2Id = '';
let brand1Id = '';
let brand2Id = '';   // belongs to org2 — used for cross-org test
let token1 = '';
let token2 = '';

beforeAll(async () => {
  // Seed Org 1 + User 1 + Brand 1
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name: 'E2E Audit Create Org 1',
    region: 'au',
    tier: 'agency',
  });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });

  const brand1 = await seedBrand({
    organizationId: org1Id,
    name:   'Bondi Plumbing',
    domain: 'bondiplumbing.com.au',
    vertical: 'tradies',
  });
  brand1Id = brand1.id;

  // Seed Org 2 + User 2 + Brand 2 (for cross-org test)
  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name: 'E2E Audit Create Org 2',
    region: 'au',
    tier: 'starter',
  });
  org2Id = org2.id;
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  const brand2 = await seedBrand({
    organizationId: org2Id,
    name:   'Sydney Dental Co',
    domain: 'sydneydentalco.com.au',
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

describe('POST /api/audits', () => {

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('TC-S2-01: returns 401 when unauthenticated', async () => {
    const { status } = await post('/api/audits', { brandId: brand1Id });
    expect(status).toBe(401);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('TC-S2-02: creates audit and returns 201 + { auditId, auditNumber }', async () => {
    const { status, body } = await createAudit(token1, { brandId: brand1Id });
    expect(status).toBe(201);

    const b = body as { auditId: string; auditNumber: number };
    expect(b.auditId).toBeTruthy();
    expect(typeof b.auditNumber).toBe('number');
    expect(b.auditNumber).toBeGreaterThan(0);
  });

  it('TC-S2-03: audit row is created with status=pending, triggeredBy=manual', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id });
    const { auditId } = body as { auditId: string };

    const audit = await getAuditById(auditId);
    expect(audit).not.toBeNull();
    expect(audit!.status).toBe('pending');
    expect(audit!.triggeredBy).toBe('manual');
    expect(audit!.brandId).toBe(brand1Id);
    expect(audit!.organizationId).toBe(org1Id);
  });

  it('TC-S2-04: mockScenario is persisted in audit.metadata when provided', async () => {
    const { body } = await createAudit(token1, {
      brandId:  brand1Id,
      scenario: 'no_mention',
    });
    const { auditId } = body as { auditId: string };

    const audit = await getAuditById(auditId);
    const meta = audit!.metadata as { mockScenario?: string };
    expect(meta.mockScenario).toBe('no_mention');
  });

  // ── auditNumber per-org sequential (Sprint 2 §9, C fix) ────────────────────

  it('TC-S2-05: first audit for org has auditNumber=1', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id });
    const { auditNumber } = body as { auditNumber: number };
    expect(auditNumber).toBe(1);
  });

  it('TC-S2-06: second audit for same org has auditNumber=2', async () => {
    await createAudit(token1, { brandId: brand1Id });
    const { body } = await createAudit(token1, { brandId: brand1Id });
    const { auditNumber } = body as { auditNumber: number };
    expect(auditNumber).toBe(2);
  });

  it('TC-S2-07: auditNumber resets to 1 for a different org (per-org, NOT global)', async () => {
    // Org 1 already has audit #1 from TC-S2-05
    await createAudit(token1, { brandId: brand1Id }); // org1 → #1

    // Org 2 creates its first audit — should also be #1, not #2
    const { body } = await createAudit(token2, { brandId: brand2Id });
    const { auditNumber } = body as { auditNumber: number };
    expect(auditNumber).toBe(1);
  });

  // ── Cross-org isolation (CLAUDE.md §7: 404 not 401) ───────────────────────

  it('TC-S2-08: POST with another org\'s brandId returns 404, not 401', async () => {
    // User 1 tries to create an audit for brand2 (owned by org2)
    const { status, body } = await createAudit(token1, { brandId: brand2Id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    // Response must not reveal brand2's name or domain
    expect(JSON.stringify(body)).not.toContain('sydneydentalco');
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('TC-S2-09: missing brandId returns 400', async () => {
    const { status } = await post('/api/audits', {}, token1);
    expect(status).toBe(400);
  });

  it('TC-S2-10: non-existent brandId returns 404', async () => {
    const { status } = await createAudit(token1, {
      brandId: '00000000-0000-0000-0000-000000000000',
    });
    expect(status).toBe(404);
  });

  it('TC-S2-11: invalid scenario value returns 400', async () => {
    const { status } = await createAudit(token1, {
      brandId:  brand1Id,
      scenario: 'invalid_scenario',
    });
    expect(status).toBe(400);
  });
});
