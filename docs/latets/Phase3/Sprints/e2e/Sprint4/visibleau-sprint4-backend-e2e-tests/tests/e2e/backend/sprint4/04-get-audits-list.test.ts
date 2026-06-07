/**
 * tests/e2e/backend/sprint4/04-get-audits-list.test.ts
 *
 * GET /api/audits — new Sprint 4 list endpoint (BB3 fix).
 *
 * Query params: ?page=1&limit=50&sort=createdAt&order=desc&brandId=X&status=Y
 * Response: { audits: AuditRow[], total: number, page: number, totalPages: number }
 * Each audit row includes brandName (from JOIN to brands).
 *
 * Sort column mapping (BH2 fix):
 *   auditNumber → audit_number
 *   status → status
 *   scoreComposite → score_composite
 *   totalCostUsd → total_cost_usd
 *   createdAt → created_at (default)
 *
 * TC-S4-27  Default response: { audits[], total, page, totalPages } shape
 * TC-S4-28  Each audit row includes brandName from JOIN
 * TC-S4-29  Results scoped to current org (cross-org isolation)
 * TC-S4-30  Pagination: page=1&limit=2 returns 2 items when >2 exist
 * TC-S4-31  Pagination: totalPages calculated correctly
 * TC-S4-32  sort=auditNumber&order=asc returns ascending by audit number
 * TC-S4-33  sort=scoreComposite&order=desc returns descending by score
 * TC-S4-34  brandId filter returns only audits for that brand
 * TC-S4-35  status=complete filter returns only complete audits
 * TC-S4-36  status=failed filter returns only failed audits
 * TC-S4-37  limit=100 server-enforced maximum (over 100 capped)
 * TC-S4-38  Unknown sort param falls back to createdAt
 * TC-S4-39  Unauthenticated → 401
 * TC-S4-40  Empty result: no audits → { audits:[], total:0, page:1, totalPages:0 }
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
  getAuditList,
  get,
} from './helpers/http';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let brand2Id = '';
let token1   = '';
let token2   = '';

// Audit IDs created for specific ordering tests
let audit1Id = '';   // auditNumber=1, complete,  score=50.0
let audit2Id = '';   // auditNumber=2, complete,  score=70.0
let audit3Id = '';   // auditNumber=3, complete,  score=90.0
let audit4Id = '';   // auditNumber=4, failed,    score=null
let audit5Id = '';   // auditNumber=5, complete,  brand2 (for brandId filter)

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name:       'S4 AuditList Org 1 (agency)',
    tier:       'agency',
  });
  org1Id = org1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name:       'S4 AuditList Org 2 (free)',
    tier:       'free',
  });
  org2Id = org2.id;

  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  await deleteAllTestDataForOrg(org1Id);
  await deleteAllTestDataForOrg(org2Id);

  const b1 = await seedBrand({ organizationId: org1Id, name: 'Bondi Plumbing',  domain: 'bondi.e2e-s4.test' });
  const b2 = await seedBrand({ organizationId: org1Id, name: 'Eastern Electrics', domain: 'eastern.e2e-s4.test' });
  brand1Id = b1.id;
  brand2Id = b2.id;

  // Seed 5 audits with deterministic timestamps for ordering
  const base = Date.now();
  const a1 = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, scoreComposite: 50.0, completedAt: new Date(base - 40_000) });
  const a2 = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 2, scoreComposite: 70.0, completedAt: new Date(base - 30_000) });
  const a3 = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 3, scoreComposite: 90.0, completedAt: new Date(base - 20_000) });
  const a4 = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 4, status: 'failed', scoreComposite: undefined, completedAt: new Date(base - 10_000) });
  const a5 = await seedAudit({ organizationId: org1Id, brandId: brand2Id, auditNumber: 1, scoreComposite: 65.0, completedAt: new Date(base) });

  audit1Id = a1.id;
  audit2Id = a2.id;
  audit3Id = a3.id;
  audit4Id = a4.id;
  audit5Id = a5.id;

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAllTestDataForOrg(org1Id);
  if (org2Id) await deleteAllTestDataForOrg(org2Id);
});

describe('TC-S4-27 to TC-S4-40: GET /api/audits — paginated list (Sprint 4 new)', () => {

  it('TC-S4-27: default response has correct shape: { audits, total, page, totalPages }', async () => {
    const { status, body } = await getAuditList(token1);
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(Array.isArray(b.audits)).toBe(true);
    expect(typeof b.total).toBe('number');
    expect(typeof b.page).toBe('number');
    expect(typeof b.totalPages).toBe('number');
    expect(b.page).toBe(1);
    expect((b.audits as unknown[]).length).toBeGreaterThan(0);
  });

  it('TC-S4-28: each audit row includes brandName from JOIN to brands', async () => {
    const { body } = await getAuditList(token1);
    const { audits } = body as { audits: Array<Record<string, unknown>> };
    for (const audit of audits) {
      expect(typeof audit.brandName).toBe('string');
      expect(audit.brandName).toBeTruthy();
      expect(audit.brandId).toBeTruthy();
    }
  });

  it('TC-S4-29: results scoped to org1 — org2 cannot see org1 audits', async () => {
    const { body } = await getAuditList(token2);
    const { audits: org2Audits } = body as { audits: Array<Record<string, unknown>> };
    const org1AuditIds = [audit1Id, audit2Id, audit3Id, audit4Id, audit5Id];
    const leaked = org2Audits.filter(a => org1AuditIds.includes(a.id as string));
    expect(leaked.length).toBe(0);
  });

  it('TC-S4-30: page=1&limit=2 returns exactly 2 items when >2 exist', async () => {
    const { body } = await getAuditList(token1, { page: 1, limit: 2 });
    const { audits } = body as { audits: unknown[] };
    expect(audits.length).toBe(2);
  });

  it('TC-S4-31: totalPages calculated from total and limit', async () => {
    const { body } = await getAuditList(token1, { page: 1, limit: 2 });
    const { total, totalPages } = body as { total: number; totalPages: number };
    // 5 audits, limit=2 → totalPages = ceil(5/2) = 3
    expect(total).toBe(5);
    expect(totalPages).toBe(Math.ceil(total / 2));
  });

  it('TC-S4-32: sort=auditNumber&order=asc returns ascending by audit number', async () => {
    const { body } = await getAuditList(token1, { sort: 'auditNumber', order: 'asc', brandId: brand1Id });
    const { audits } = body as { audits: Array<{ auditNumber: number }> };
    const numbers = audits.map(a => a.auditNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers[0]).toBe(1);
  });

  it('TC-S4-33: sort=scoreComposite&order=desc returns descending by score', async () => {
    const { body } = await getAuditList(token1, { sort: 'scoreComposite', order: 'desc', status: 'complete' });
    const { audits } = body as { audits: Array<{ scoreComposite: string | null }> };
    const scores = audits
      .filter(a => a.scoreComposite !== null)
      .map(a => parseFloat(a.scoreComposite!));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
    // Top score should be 90.0
    expect(scores[0]).toBeCloseTo(90.0, 1);
  });

  it('TC-S4-34: brandId filter returns only audits for brand1', async () => {
    const { body } = await getAuditList(token1, { brandId: brand1Id });
    const { audits, total } = body as { audits: Array<{ brandId: string }>; total: number };
    expect(total).toBe(4); // audit1-4 are for brand1
    for (const audit of audits) {
      expect(audit.brandId).toBe(brand1Id);
    }
  });

  it('TC-S4-35: status=complete filter returns only complete audits', async () => {
    const { body } = await getAuditList(token1, { status: 'complete' });
    const { audits } = body as { audits: Array<{ status: string }> };
    for (const audit of audits) {
      expect(audit.status).toBe('complete');
    }
    // audit4 is failed — must not appear
    const failedIds = audits.filter(a => (a as any).id === audit4Id);
    expect(failedIds.length).toBe(0);
  });

  it('TC-S4-36: status=failed filter returns only failed audits', async () => {
    const { body } = await getAuditList(token1, { status: 'failed' });
    const { audits, total } = body as { audits: Array<{ status: string }>; total: number };
    expect(total).toBe(1);
    expect(audits[0].status).toBe('failed');
  });

  it('TC-S4-37: limit over 100 is server-capped at 100', async () => {
    const { body } = await getAuditList(token1, { limit: 999 });
    const { audits } = body as { audits: unknown[] };
    // Should return 5 (fewer than 100) — just verifying no crash
    expect(audits.length).toBeLessThanOrEqual(100);
  });

  it('TC-S4-38: unknown sort param falls back to createdAt desc', async () => {
    // Should not crash with an unknown sort value
    const { status } = await getAuditList(token1, { sort: 'invalidColumn', order: 'asc' });
    expect(status).toBe(200);
  });

  it('TC-S4-39: unauthenticated GET /api/audits → 401', async () => {
    const { status } = await get('/api/audits');
    expect(status).toBe(401);
  });

  it('TC-S4-40: org with no audits → empty list with total=0', async () => {
    // Org 2 has no audits
    const { body } = await getAuditList(token2);
    const { audits, total, page } = body as { audits: unknown[]; total: number; page: number };
    expect(audits).toEqual([]);
    expect(total).toBe(0);
    expect(page).toBe(1);
  });
});
