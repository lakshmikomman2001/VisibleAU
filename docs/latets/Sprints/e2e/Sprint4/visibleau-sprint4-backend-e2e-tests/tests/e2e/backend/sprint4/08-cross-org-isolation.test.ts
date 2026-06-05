/**
 * tests/e2e/backend/sprint4/08-cross-org-isolation.test.ts
 *
 * Cross-org security isolation — Sprint 4 routes.
 *
 * Rule (consistent with Sprint 1-3):
 *   - Wrong org → 404 (NOT 401 — 401 leaks resource existence)
 *   - Unauthenticated → 401 on all routes
 *
 * Sprint 4 adds these protected routes:
 *   DELETE /api/brands/[brandId]
 *   GET    /api/audits (list)
 *   GET    /api/audits/[auditId]/export?format=csv|json|pdf
 *
 * TC-S4-65  User 2 DELETE /api/brands/[org1-brandId] → 404
 * TC-S4-66  User 2 GET /api/audits → sees only own org audits (0)
 * TC-S4-67  User 2 GET /api/audits/[org1-auditId]/export?format=csv → 404
 * TC-S4-68  User 2 GET /api/audits/[org1-auditId]/export?format=json → 404
 * TC-S4-69  User 2 GET /api/audits/[org1-auditId]/export?format=pdf → 404
 * TC-S4-70  404 response body does NOT contain org1 UUID (no data leakage)
 * TC-S4-71  Unauthenticated DELETE /api/brands/[id] → 401
 * TC-S4-72  Unauthenticated GET /api/audits → 401
 * TC-S4-73  Unauthenticated GET /api/audits/[id]/export?format=csv → 401
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  seedOrganization,
  seedUser,
  seedBrand,
  seedAudit,
  deleteAllTestDataForOrg,
} from './helpers/db';
import {
  TEST_USER_1,
  TEST_USER_2,
  getClerkToken,
  deleteBrand,
  getAuditList,
  exportAudit,
  get,
  del,
  rawGet,
} from './helpers/http';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let audit1Id = '';
let token1   = '';
let token2   = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name:       'S4 CrossOrg Org 1 (agency)',
    tier:       'agency',
  });
  org1Id = org1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name:       'S4 CrossOrg Org 2 (free)',
    tier:       'free',
  });
  org2Id = org2.id;

  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  await deleteAllTestDataForOrg(org1Id);
  await deleteAllTestDataForOrg(org2Id);

  const brand = await seedBrand({
    organizationId: org1Id,
    name:           'CrossOrg Target Brand',
    domain:         'crossorg.e2e-s4.test',
  });
  brand1Id = brand.id;

  const audit = await seedAudit({
    organizationId: org1Id,
    brandId:        brand1Id,
    auditNumber:    1,
    scoreComposite: 60.0,
  });
  audit1Id = audit.id;

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAllTestDataForOrg(org1Id);
  if (org2Id) await deleteAllTestDataForOrg(org2Id);
});

describe('TC-S4-65 to TC-S4-73: Cross-org isolation on Sprint 4 routes', () => {

  it('TC-S4-65: User 2 DELETE /api/brands/[org1-brandId] → 404 not 401', async () => {
    const { status } = await deleteBrand(token2, brand1Id);
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    // Verify brand still exists (not deleted)
    const { body } = await get(`/api/brands`, token1);
    const brands = body as Array<Record<string, unknown>>;
    expect(brands.find(b => b.id === brand1Id)).toBeDefined();
  });

  it('TC-S4-66: User 2 GET /api/audits → sees zero rows (own org, not org1)', async () => {
    const { status, body } = await getAuditList(token2);
    expect(status).toBe(200);
    const { audits, total } = body as { audits: Array<Record<string, unknown>>; total: number };
    // Org2 has no audits
    const org1Audit = audits.find(a => a.id === audit1Id);
    expect(org1Audit).toBeUndefined();
    expect(total).toBe(0);
  });

  it('TC-S4-67: User 2 GET /api/audits/[org1-id]/export?format=csv → 404', async () => {
    const { status } = await exportAudit(token2, audit1Id, 'csv');
    expect(status).toBe(404);
    expect(status).not.toBe(401);
  });

  it('TC-S4-68: User 2 GET /api/audits/[org1-id]/export?format=json → 404', async () => {
    const { status } = await exportAudit(token2, audit1Id, 'json');
    expect(status).toBe(404);
    expect(status).not.toBe(401);
  });

  it('TC-S4-69: User 2 GET /api/audits/[org1-id]/export?format=pdf → 404', async () => {
    const { status } = await exportAudit(token2, audit1Id, 'pdf');
    expect(status).toBe(404);
    expect(status).not.toBe(401);
  });

  it('TC-S4-70: 404 response body does not contain org1 UUID (no data leakage)', async () => {
    const { text } = await exportAudit(token2, audit1Id, 'json');
    expect(text).not.toContain(org1Id);
    expect(text).not.toContain(brand1Id);
  });

  it('TC-S4-71: unauthenticated DELETE /api/brands/[id] → 401', async () => {
    const { status } = await del(`/api/brands/${brand1Id}`);
    expect(status).toBe(401);
  });

  it('TC-S4-72: unauthenticated GET /api/audits → 401', async () => {
    const { status } = await get('/api/audits');
    expect(status).toBe(401);
  });

  it('TC-S4-73: unauthenticated GET /api/audits/[id]/export?format=csv → 401', async () => {
    const { status } = await rawGet(`/api/audits/${audit1Id}/export?format=csv`);
    expect(status).toBe(401);
  });
});
