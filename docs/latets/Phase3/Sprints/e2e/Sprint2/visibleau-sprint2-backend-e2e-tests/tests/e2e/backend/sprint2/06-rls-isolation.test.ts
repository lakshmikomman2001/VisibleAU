/**
 * tests/e2e/backend/sprint2/06-rls-isolation.test.ts
 *
 * Backend E2E: RLS isolation for Sprint 2 tables
 *
 * Sprint 2 §5 (P2 fix): audits and citations tables have RLS policies.
 * Policy: users see only their org's audits (organisation_id = app.current_org_id).
 * Citations scoped via parent audit's organizationId.
 *
 * CLAUDE.md §7: "Never return 401 on cross-org access. Return 404."
 *
 * Tests verify that:
 *   - GET /api/audits/[id] returns 404 for cross-org audits (not 401, not 200)
 *   - testDb (service-role) sees all orgs' audits — confirming RLS is applied at API level
 *   - POST /api/audits with another org's brandId returns 404
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  testDb,
  seedOrganization,
  seedUser,
  seedBrand,
  seedAudit,
  truncateSprint2TablesForOrgs,
  deleteBrandsForOrg,
} from './helpers/db';
import * as schema from '../../../../db/schema';
import {
  TEST_USER_1,
  TEST_USER_2,
  getClerkToken,
  getAudit,
  createAudit,
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
    name: 'E2E RLS Org 1',
    region: 'au',
    tier: 'agency',
  });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const brand1 = await seedBrand({ organizationId: org1Id, name: 'RLS Brand 1', domain: 'rlsbrand1.test', vertical: 'tradies' });
  brand1Id = brand1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name: 'E2E RLS Org 2',
    region: 'au',
    tier: 'starter',
  });
  org2Id = org2.id;
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });
  const brand2 = await seedBrand({ organizationId: org2Id, name: 'RLS Brand 2', domain: 'rlsbrand2.test', vertical: 'saas' });
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

describe('RLS isolation: audits and citations', () => {

  it('TC-S2-60: User2 GET org1 audit returns 404 (not 401) — CLAUDE.md §7', async () => {
    const audit = await seedAudit({
      organizationId: org1Id,
      brandId: brand1Id,
      auditNumber: 1,
      status: 'complete',
      scoreComposite: '70.00',
    });

    const { status, body } = await getAudit(token2, audit.id);
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    expect(status).not.toBe(200);

    // Body must not leak any org1 audit data
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain(org1Id);
    expect(bodyStr).not.toContain('70.00');
  });

  it('TC-S2-61: User1 GET org2 audit returns 404 (CLAUDE.md §7)', async () => {
    const audit = await seedAudit({
      organizationId: org2Id,
      brandId: brand2Id,
      auditNumber: 1,
      status: 'complete',
    });

    const { status } = await getAudit(token1, audit.id);
    expect(status).toBe(404);
  });

  it('TC-S2-62: User1 can only see own audits — org2 audit not accessible', async () => {
    // Seed one audit each
    const audit1 = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1 });
    const audit2 = await seedAudit({ organizationId: org2Id, brandId: brand2Id, auditNumber: 1 });

    // User1 can access their own
    const { status: s1 } = await getAudit(token1, audit1.id);
    expect(s1).toBe(200);

    // User1 cannot access org2's
    const { status: s2 } = await getAudit(token1, audit2.id);
    expect(s2).toBe(404);
  });

  it('TC-S2-63: Service-role testDb sees all audits across orgs (bypass RLS)', async () => {
    const audit1 = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1 });
    const audit2 = await seedAudit({ organizationId: org2Id, brandId: brand2Id, auditNumber: 1 });

    // testDb bypasses RLS — sees both
    const all = await testDb.select().from(schema.audits);
    const ids = all.map((a) => a.id);
    expect(ids).toContain(audit1.id);
    expect(ids).toContain(audit2.id);
  });

  it('TC-S2-64: POST /api/audits with cross-org brandId returns 404', async () => {
    // User1 tries to create audit for org2's brand
    const { status, body } = await createAudit(token1, { brandId: brand2Id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    expect(JSON.stringify(body)).not.toContain(org2Id);
  });

  it('TC-S2-65: Citations for org1 audit are not accessible via org2 session', async () => {
    // This is verified indirectly: if GET /api/audits/[id] returns 404 for cross-org,
    // the endpoint never returns citationCount, so citations are also hidden.
    const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1 });

    // Seed a citation for org1's audit
    await testDb.insert(schema.citations).values({
      auditId:       audit.id,
      engine:        'chatgpt',
      prompt:        'Who are the best plumbers in Sydney?',
      runNumber:     1,
      brandMentioned: true,
      responseSnippet: 'Bondi Plumbing is great.',
      citedSources:  [],
      contextSnippets: [],
    });

    // User2 tries to get the audit — 404, so citation data never returned
    const { status } = await getAudit(token2, audit.id);
    expect(status).toBe(404);
  });
});
