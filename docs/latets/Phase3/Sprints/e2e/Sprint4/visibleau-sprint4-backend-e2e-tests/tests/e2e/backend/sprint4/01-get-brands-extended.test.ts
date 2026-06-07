/**
 * tests/e2e/backend/sprint4/01-get-brands-extended.test.ts
 *
 * GET /api/brands — Sprint 4 extension (BF1+BF5 fix).
 *
 * Sprint 4 adds a Postgres LATERAL JOIN to include lastAuditScore,
 * lastAuditAt, and lastAuditStatus on every brand in the response.
 * Soft-deleted brands must be excluded.
 *
 * TC-S4-01  Response includes lastAuditScore, lastAuditAt, lastAuditStatus fields
 * TC-S4-02  Brand with completed audit shows scoreComposite as lastAuditScore
 * TC-S4-03  Brand with no audits shows null for all three audit fields
 * TC-S4-04  lastAuditStatus reflects most recent audit status (complete)
 * TC-S4-05  When brand has multiple audits, returns most recent (highest completedAt)
 * TC-S4-06  Soft-deleted brand is excluded from response
 * TC-S4-07  Unauthenticated → 401
 * TC-S4-08  Cross-org: User 2 cannot see User 1 brands
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  testDb,
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
  getBrands,
  get,
} from './helpers/http';
import * as schema from '../../../../../db/schema';
import { eq } from 'drizzle-orm';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';   // brand with one complete audit
let brand2Id = '';   // brand with NO audits
let brand3Id = '';   // brand with two audits (tests most-recent logic)
let brand4Id = '';   // soft-deleted brand (must be excluded)

let token1 = '';
let token2 = '';

beforeAll(async () => {
  // ── Seed orgs ──────────────────────────────────────────────────────────────
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name:       'S4 E2E Org 1 (agency)',
    tier:       'agency',
  });
  org1Id = org1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name:       'S4 E2E Org 2 (free)',
    tier:       'free',
  });
  org2Id = org2.id;

  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  // ── Seed brands ────────────────────────────────────────────────────────────
  await deleteAllTestDataForOrg(org1Id);
  await deleteAllTestDataForOrg(org2Id);

  const b1 = await seedBrand({ organizationId: org1Id, name: 'Bondi Plumbing',     domain: 'bondi.e2e-s4.test' });
  const b2 = await seedBrand({ organizationId: org1Id, name: 'Eastern Electrical',  domain: 'eastern.e2e-s4.test' });
  const b3 = await seedBrand({ organizationId: org1Id, name: 'Parramatta Pipes',    domain: 'parra.e2e-s4.test' });
  const b4 = await seedBrand({ organizationId: org1Id, name: 'Deleted Brand',       domain: 'deleted.e2e-s4.test' });

  brand1Id = b1.id;
  brand2Id = b2.id;
  brand3Id = b3.id;
  brand4Id = b4.id;

  // brand1: one complete audit
  await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, scoreComposite: 63.4 });

  // brand2: no audits at all

  // brand3: two audits — most recent score = 77.1, older = 55.0
  const older = new Date(Date.now() - 86_400_000 * 2); // 2 days ago
  const newer = new Date(Date.now() - 86_400_000);     // 1 day ago
  await seedAudit({ organizationId: org1Id, brandId: brand3Id, auditNumber: 1, scoreComposite: 55.0, completedAt: older });
  await seedAudit({ organizationId: org1Id, brandId: brand3Id, auditNumber: 2, scoreComposite: 77.1, completedAt: newer });

  // brand4: soft-deleted — C5 FIX: use top-level imports instead of redundant dynamic import
  await testDb.update(schema.brands).set({ deletedAt: new Date() }).where(eq(schema.brands.id, brand4Id));

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAllTestDataForOrg(org1Id);
  if (org2Id) await deleteAllTestDataForOrg(org2Id);
});

describe('TC-S4-01 to TC-S4-08: GET /api/brands — Sprint 4 extended response', () => {

  it('TC-S4-01: response includes lastAuditScore, lastAuditAt, lastAuditStatus on each brand', async () => {
    const { status, body } = await getBrands(token1);
    expect(status).toBe(200);
    const brands = body as Array<Record<string, unknown>>;
    expect(Array.isArray(brands)).toBe(true);
    expect(brands.length).toBeGreaterThan(0);
    // Every brand must have the three new fields (they may be null)
    // C19 FIX: use expect(b.field) not expect('fieldName') — the latter always passes trivially
    for (const b of brands) {
      expect(Object.keys(b), `brand ${b.id}`).toContain('lastAuditScore');
      expect(Object.keys(b), `brand ${b.id}`).toContain('lastAuditAt');
      expect(Object.keys(b), `brand ${b.id}`).toContain('lastAuditStatus');
      // Values are string | null (Drizzle numeric → string serialisation)
      if (b.lastAuditScore !== null) {
        expect(typeof b.lastAuditScore).toBe('string');
      }
    }
  });

  it('TC-S4-02: brand with one complete audit shows scoreComposite as lastAuditScore', async () => {
    const { body } = await getBrands(token1);
    const brands = body as Array<Record<string, unknown>>;
    const b1 = brands.find(b => b.id === brand1Id);
    expect(b1).toBeDefined();
    expect(parseFloat(b1!.lastAuditScore as string)).toBeCloseTo(63.4, 1);
    expect(b1!.lastAuditStatus).toBe('complete');
    expect(b1!.lastAuditAt).not.toBeNull();
  });

  it('TC-S4-03: brand with no audits has null for all three lateral join fields', async () => {
    const { body } = await getBrands(token1);
    const brands = body as Array<Record<string, unknown>>;
    const b2 = brands.find(b => b.id === brand2Id);
    expect(b2).toBeDefined();
    expect(b2!.lastAuditScore).toBeNull();
    expect(b2!.lastAuditAt).toBeNull();
    expect(b2!.lastAuditStatus).toBeNull();
  });

  it('TC-S4-04: lastAuditStatus = complete when most recent audit is complete', async () => {
    const { body } = await getBrands(token1);
    const brands = body as Array<Record<string, unknown>>;
    const b1 = brands.find(b => b.id === brand1Id);
    expect(b1!.lastAuditStatus).toBe('complete');
  });

  it('TC-S4-05: brand with two audits — lastAuditScore from most recent (77.1 not 55.0)', async () => {
    const { body } = await getBrands(token1);
    const brands = body as Array<Record<string, unknown>>;
    const b3 = brands.find(b => b.id === brand3Id);
    expect(b3).toBeDefined();
    // Most recent audit has score 77.1
    expect(parseFloat(b3!.lastAuditScore as string)).toBeCloseTo(77.1, 1);
  });

  it('TC-S4-06: soft-deleted brand4 does NOT appear in GET /api/brands', async () => {
    const { body } = await getBrands(token1);
    const brands = body as Array<Record<string, unknown>>;
    const deleted = brands.find(b => b.id === brand4Id);
    expect(deleted).toBeUndefined();
  });

  it('TC-S4-07: unauthenticated GET /api/brands → 401', async () => {
    const { status } = await get('/api/brands');
    expect(status).toBe(401);
  });

  it('TC-S4-08: User 2 GET /api/brands sees only their own org brands (cross-org isolation)', async () => {
    const { status, body } = await getBrands(token2);
    expect(status).toBe(200);
    const brands2 = body as Array<Record<string, unknown>>;
    // Org 2 has no brands seeded — should be empty
    const org1Brands = brands2.filter(b =>
      [brand1Id, brand2Id, brand3Id, brand4Id].includes(b.id as string)
    );
    expect(org1Brands.length).toBe(0);
  });
});
