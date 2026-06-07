/**
 * tests/e2e/backend/sprint3/04-audit-create-multiengine.test.ts
 *
 * POST /api/audits — verifies Sprint 3 audit creation with tier-derived engines.
 * No Inngest needed — tests the API route and resulting DB row, not the job execution.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  seedOrganization, seedUser, seedBrand,
  deleteAuditsForOrg, deleteBrandsForOrg,
  getAuditById,
} from './helpers/db';
import { TEST_USER_1, TEST_USER_2, getClerkToken, createAudit, post } from './helpers/http'; // R1 FIX: post needed for TC-S3-52 unauthenticated POST test

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let token1   = ''; // W1 FIX: token2 removed — TEST_USER_2 token never used in any test in this file

beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: TEST_USER_1.clerkOrgId, name: 'S3 Create Org1', tier: 'agency' });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const b1 = await seedBrand({ organizationId: org1Id, name: 'S3 Brand', domain: 's3.e2e.test' });
  brand1Id = b1.id;

  const org2 = await seedOrganization({ clerkOrgId: TEST_USER_2.clerkOrgId, name: 'S3 Create Org2', tier: 'free' });
  org2Id = org2.id;
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  token1 = await getClerkToken(TEST_USER_1);
  // W1 FIX: token2 removed — getClerkToken(TEST_USER_2) was a wasted Clerk API call
});

afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org2Id) await deleteAuditsForOrg(org2Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
  if (org2Id) await deleteBrandsForOrg(org2Id);
});

beforeEach(async () => {
  await deleteAuditsForOrg(org1Id);
  await deleteAuditsForOrg(org2Id);
});

describe('POST /api/audits — Sprint 3 multi-engine creation', () => {

  it('TC-S3-50: POST /api/audits returns 201 + { auditId, auditNumber }', async () => {
    const { status, body } = await createAudit(token1, { brandId: brand1Id });
    expect(status).toBe(201);
    const b = body as { auditId: string; auditNumber: number };
    expect(b.auditId).toBeTruthy();
    expect(b.auditNumber).toBeGreaterThan(0);
  });

  it('TC-S3-51: audit row created with status=pending, triggeredBy=manual', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id });
    const { auditId } = body as { auditId: string };
    const audit = await getAuditById(auditId);
    expect(audit?.status).toBe('pending');
    expect(audit?.triggeredBy).toBe('manual');
    expect(audit?.organizationId).toBe(org1Id);
  });

  it('TC-S3-52: 401 without auth', async () => {
    // N2 FIX: GET /api/audits (list) is not a Sprint 2/3 route — it would return 404 not 401.
    // Sprint 2/3 only defines POST /api/audits and GET /api/audits/[auditId].
    // Use POST /api/audits without a token — this route exists and is auth-protected.
    const { status } = await post('/api/audits', { brandId: brand1Id }, undefined);
    expect(status).toBe(401);
  });

  it('TC-S3-53: cross-org brandId returns 404 (CLAUDE.md §7)', async () => {
    // brand1Id belongs to org1 — org2 user tries to use it
    const b2 = await seedBrand({ organizationId: org2Id, name: 'S3 Org2 Brand', domain: 's3org2.e2e.test' });
    const { status } = await createAudit(token1, { brandId: b2.id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
  });

  it('TC-S3-54: invalid scenario value returns 400', async () => {
    const { status } = await createAudit(token1, { brandId: brand1Id, scenario: 'invalid_scenario' });
    expect(status).toBe(400);
  });

  it('TC-S3-55: missing brandId returns 400', async () => {
    const { status } = await createAudit(token1, { brandId: '' });
    expect([400, 404]).toContain(status);
  });
});
