/**
 * tests/e2e/backend/sprint3/08-wilson-ci.test.ts
 *
 * Sprint 3 §7 (wilsonCI) + AC3c: CI bounds bracket composite.
 * Tests pure function + DB-seeded audit CI shape.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { wilsonCI } from '@/lib/scoring/wilson';
import {
  seedOrganization, seedUser, seedBrand, seedSprint3Audit,
  deleteAuditsForOrg, deleteBrandsForOrg, getAuditById,
} from './helpers/db';
import { TEST_USER_1, getClerkToken, getAuditFull } from './helpers/http';

let org1Id   = '';
let brand1Id = '';
let auditId  = '';
let token1   = '';

beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: TEST_USER_1.clerkOrgId, name: 'S3 Wilson Org', tier: 'agency' });
  org1Id = org.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const b = await seedBrand({ organizationId: org1Id, name: 'S3 Wilson Brand', domain: 's3wilson.e2e.test' });
  brand1Id = b.id;
  token1 = await getClerkToken(TEST_USER_1);

  const audit = await seedSprint3Audit({
    organizationId:   org1Id,
    brandId:          brand1Id,
    auditNumber:      1,
    scoreComposite:   70,
    scoreConfidenceLow:  55,
    scoreConfidenceHigh: 82,
    confidenceIntervals: {
      frequency: { lower: 48.2, upper: 88.6 },
      position:  { lower: 52.1, upper: 91.3 },
      sentiment: { lower: 55.0, upper: 89.0 },
      context:   { lower: 42.0, upper: 85.0 },
      accuracy:  { lower: 38.5, upper: 83.2 },
    },
  });
  auditId = audit.id;
});

afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

describe('Sprint 3 §7 — Wilson CI pure function', () => {

  it('TC-S3-120: wilsonCI(0, 0) → { lower: 0, upper: 0 } (zero denominator)', () => {
    expect(wilsonCI(0, 0)).toEqual({ lower: 0, upper: 0 });
  });

  it('TC-S3-121: wilsonCI(5, 5).upper > 90 (5/5 successes → CI near top)', () => {
    const { upper } = wilsonCI(5, 5);
    expect(upper).toBeGreaterThan(90);
  });

  it('TC-S3-122: wilsonCI(0, 5).lower = 0 (0/5 successes → CI near bottom)', () => {
    const { lower } = wilsonCI(0, 5);
    expect(lower).toBe(0);
  });

  it('TC-S3-123: wilsonCI(3, 5) brackets the true 60% → lower < 60 < upper', () => {
    const { lower, upper } = wilsonCI(3, 5);
    expect(lower).toBeLessThan(60);
    expect(upper).toBeGreaterThan(60);
  });

  it('TC-S3-124: wilsonCI always returns lower ≤ upper', () => {
    const cases = [[0,5],[1,5],[3,5],[5,5],[10,20],[1,100]];
    for (const [s, t] of cases) {
      const { lower, upper } = wilsonCI(s!, t!);
      expect(lower).toBeLessThanOrEqual(upper);
    }
  });

  it('TC-S3-125: wilsonCI output values are in [0, 100] range', () => {
    const { lower, upper } = wilsonCI(3, 5);
    expect(lower).toBeGreaterThanOrEqual(0);
    expect(upper).toBeLessThanOrEqual(100);
  });
});

describe('Sprint 3 AC3c — CI bounds in DB and API', () => {

  it('TC-S3-126: AC3c — DB: scoreConfidenceLow ≤ scoreComposite ≤ scoreConfidenceHigh', async () => {
    const audit = await getAuditById(auditId);
    const low  = parseFloat(audit?.scoreConfidenceLow  ?? '0');
    const comp = parseFloat(audit?.scoreComposite      ?? '0');
    const high = parseFloat(audit?.scoreConfidenceHigh ?? '100');
    expect(low).toBeLessThanOrEqual(comp);
    expect(comp).toBeLessThanOrEqual(high);
  });

  it('TC-S3-127: DB: confidenceIntervals jsonb has all 5 dimension keys', async () => {
    const audit = await getAuditById(auditId);
    const ci = audit?.confidenceIntervals as Record<string, { lower: number; upper: number }> | null;
    expect(ci).not.toBeNull();
    const dims = ['frequency', 'position', 'sentiment', 'context', 'accuracy'];
    for (const dim of dims) {
      expect(ci?.[dim], `CI for ${dim}`).toBeDefined();
      expect(ci![dim].lower).toBeLessThanOrEqual(ci![dim].upper);
    }
  });

  it('TC-S3-128: GET /api/audits/[id]/full — confidenceIntervals present in response', async () => {
    const { status, body } = await getAuditFull(token1, auditId);
    expect(status).toBe(200);
    const b = body as { audit: { confidenceIntervals: unknown } };
    expect(b.audit.confidenceIntervals).not.toBeNull();
  });
});
