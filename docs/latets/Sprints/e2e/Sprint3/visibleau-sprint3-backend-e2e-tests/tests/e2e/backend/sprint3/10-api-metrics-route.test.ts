/**
 * tests/e2e/backend/sprint3/10-api-metrics-route.test.ts
 *
 * GET /api/brands/[brandId]/metrics — Sprint 3 §9 trend data endpoint.
 *
 * Response shape (§9 exact):
 *   { audits: [{ id, compositeScore, completedAt }], // last 20
 *     trend: 'up' | 'down' | 'flat',
 *     lastAuditScore: number,
 *     changeVsPriorAudit: number }
 *
 * Auth: getCurrentUser() + setRlsContext(). Cross-org → 404 (not 401).
 * No Inngest required — all audits seeded directly via DB.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  seedOrganization, seedUser, seedBrand,
  seedSprint3Audit, deleteAuditsForOrg, deleteBrandsForOrg,
} from './helpers/db';
import {
  TEST_USER_1, TEST_USER_2, getClerkToken,
  getBrandMetrics, get,
} from './helpers/http';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let brand2Id = '';   // org2 brand – for cross-org RLS test
let token1   = '';
let token2   = '';

beforeAll(async () => {
  // ── Org 1 (agency) ──────────────────────────────────────────────────────
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name: 'S3 Metrics Org1',
    tier: 'agency',
  });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const b1 = await seedBrand({ organizationId: org1Id, name: 'S3 Metrics Brand', domain: 's3metrics.e2e.test' });
  brand1Id = b1.id;

  // ── Org 2 (free) ─────────────────────────────────────────────────────────
  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name: 'S3 Metrics Org2',
    tier: 'free',
  });
  org2Id = org2.id;
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });
  const b2 = await seedBrand({ organizationId: org2Id, name: 'S3 Metrics Org2 Brand', domain: 's3metricsorg2.e2e.test' });
  brand2Id = b2.id;

  // V2 FIX: purge any stale audits from prior interrupted runs before seeding.
  // TC-S3-143/144/145 assert specific lastAuditScore and trend values that depend on
  // only these 3 audits existing — stale data from a prior run would corrupt results.
  await deleteAuditsForOrg(org1Id);

  // V4 FIX: stagger completedAt by 1s intervals so the metrics route can order
  // audits deterministically by completedAt DESC. Without this, all 3 audits share
  // the same millisecond timestamp and ordering is undefined — TC-S3-143/144/145
  // may receive a different 'last' or 'prior' audit than expected.
  const now = Date.now();
  await seedSprint3Audit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1,
    scoreComposite: 50, scoreConfidenceLow: 38, scoreConfidenceHigh: 62,
    scoreSentiment: 'neutral', scoreContext: 'listed',
    completedAtOverride: new Date(now - 2_000) });   // oldest

  await seedSprint3Audit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 2,
    scoreComposite: 65, scoreConfidenceLow: 52, scoreConfidenceHigh: 76,
    scoreSentiment: 'positive', scoreContext: 'recommended',
    completedAtOverride: new Date(now - 1_000) });   // middle

  await seedSprint3Audit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 3,
    scoreComposite: 75, scoreConfidenceLow: 62, scoreConfidenceHigh: 85,
    scoreSentiment: 'positive', scoreContext: 'recommended',
    completedAtOverride: new Date(now) });            // most recent

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org2Id) await deleteAuditsForOrg(org2Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
  if (org2Id) await deleteBrandsForOrg(org2Id);
});

describe('GET /api/brands/[brandId]/metrics — Sprint 3 §9', () => {

  it('TC-S3-140: returns 200 with correct top-level shape', async () => {
    const { status, body } = await getBrandMetrics(token1, brand1Id);
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(Array.isArray(b.audits)).toBe(true);
    expect(['up', 'down', 'flat']).toContain(b.trend);
    expect(typeof b.lastAuditScore).toBe('number');
    expect(typeof b.changeVsPriorAudit).toBe('number');
  });

  it('TC-S3-141: audits array contains the seeded audit history (up to last 20)', async () => {
    const { body } = await getBrandMetrics(token1, brand1Id);
    const b = body as { audits: Array<{ id: string; compositeScore: number; completedAt: string }> };
    expect(b.audits.length).toBeGreaterThanOrEqual(3);
    // Each audit row has id, compositeScore, completedAt per §9 spec
    for (const a of b.audits) {
      expect(a.id).toBeTruthy();
      expect(typeof a.compositeScore).toBe('number');
      expect(a.completedAt).toBeTruthy();
    }
  });

  it('TC-S3-142: audits capped at 20 (§9: last 20 audits)', async () => {
    const { body } = await getBrandMetrics(token1, brand1Id);
    const b = body as { audits: unknown[] };
    expect(b.audits.length).toBeLessThanOrEqual(20);
  });

  it('TC-S3-143: lastAuditScore matches the most recent completed audit composite', async () => {
    const { body } = await getBrandMetrics(token1, brand1Id);
    const b = body as { lastAuditScore: number };
    // Most recent audit has scoreComposite=75
    expect(b.lastAuditScore).toBeCloseTo(75, 0);
  });

  it('TC-S3-144: trend="up" when most recent score is higher than prior audit', async () => {
    // Seeded: 50 → 65 → 75 (ascending) → trend = "up"
    const { body } = await getBrandMetrics(token1, brand1Id);
    const b = body as { trend: string };
    expect(b.trend).toBe('up');
  });

  it('TC-S3-145: changeVsPriorAudit = lastScore − secondLastScore', async () => {
    // 75 − 65 = 10
    const { body } = await getBrandMetrics(token1, brand1Id);
    const b = body as { changeVsPriorAudit: number };
    expect(b.changeVsPriorAudit).toBeCloseTo(10, 0);
  });

  it('TC-S3-146: trend="down" when scores are descending', async () => {
    // Create a separate brand with descending audits
    // Q9 FIX: auditNumber must not collide with beforeAll's 1,2,3.
    // Unique constraint: (organizationId, auditNumber) across the whole org.
    // Use 10, 11 for downBrand to avoid collision.
    const downBrand = await seedBrand({ organizationId: org1Id, name: 'S3 Down Brand', domain: 's3down.e2e.test' });
    await seedSprint3Audit({ organizationId: org1Id, brandId: downBrand.id, auditNumber: 10,
      scoreComposite: 80, scoreConfidenceLow: 65, scoreConfidenceHigh: 90 });
    await seedSprint3Audit({ organizationId: org1Id, brandId: downBrand.id, auditNumber: 11,
      scoreComposite: 60, scoreConfidenceLow: 48, scoreConfidenceHigh: 72 });

    const { status, body } = await getBrandMetrics(token1, downBrand.id);
    expect(status).toBe(200);
    const b = body as { trend: string };
    expect(b.trend).toBe('down');
  });

  it('TC-S3-147: trend="flat" when only one audit exists (no prior to compare)', async () => {
    // Q9 FIX: auditNumber 20 — safely above beforeAll's 1,2,3 and downBrand's 10,11.
    const flatBrand = await seedBrand({ organizationId: org1Id, name: 'S3 Flat Brand', domain: 's3flat.e2e.test' });
    await seedSprint3Audit({ organizationId: org1Id, brandId: flatBrand.id, auditNumber: 20,
      scoreComposite: 70, scoreConfidenceLow: 55, scoreConfidenceHigh: 82 });

    const { status, body } = await getBrandMetrics(token1, flatBrand.id);
    expect(status).toBe(200);
    const b = body as { trend: string; changeVsPriorAudit: number };
    expect(b.trend).toBe('flat');
    expect(b.changeVsPriorAudit).toBe(0);
  });

  it('TC-S3-148: 401 without auth', async () => {
    const { status } = await get(`/api/brands/${brand1Id}/metrics`, undefined);
    expect(status).toBe(401);
  });

  it('TC-S3-149: cross-org brand returns 404 not 401 (CLAUDE.md §7)', async () => {
    // User 2 tries to fetch metrics for brand1 (belongs to Org 1)
    const { status, body } = await getBrandMetrics(token2, brand1Id);
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    // Response body must not contain Org 1 data
    expect(JSON.stringify(body)).not.toContain(org1Id);
  });

  it('TC-S3-150: non-existent brandId returns 404', async () => {
    const { status } = await getBrandMetrics(token1, '00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
  });

  it('TC-S3-151: brand with no completed audits returns empty audits array and trend="flat"', async () => {
    const emptyBrand = await seedBrand({
      organizationId: org1Id, name: 'S3 Empty Brand', domain: 's3empty.e2e.test',
    });
    const { status, body } = await getBrandMetrics(token1, emptyBrand.id);
    expect(status).toBe(200);
    const b = body as { audits: unknown[]; trend: string; lastAuditScore: number; changeVsPriorAudit: number };
    expect(b.audits).toHaveLength(0);
    expect(b.trend).toBe('flat');
    expect(b.lastAuditScore).toBe(0);
    expect(b.changeVsPriorAudit).toBe(0);
  });
});
