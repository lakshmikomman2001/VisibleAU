/**
 * tests/e2e/backend/sprint2/02-audit-status.test.ts
 *
 * Backend E2E: GET /api/audits/[auditId]
 *
 * Sprint 2 §9 spec (P7 fix):
 *   Response: { audit: { id, auditNumber, status, scoreComposite, totalCostUsd,
 *               promptsCount, engines, startedAt, completedAt, metadata },
 *               citationCount: number }
 *   - citationCount: count of citations rows (Sprint 4 polls this for progress bar)
 *   - Cross-org returns 404 (CLAUDE.md §7)
 *   - 404 if auditId does not exist
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
  get,
} from './helpers/http';
import { eq } from 'drizzle-orm';

let org1Id = '';
let org2Id = '';
let brand1Id = '';
let brand2Id = '';
let token1 = '';
let token2 = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name: 'E2E Audit Status Org 1',
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

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name: 'E2E Audit Status Org 2',
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

describe('GET /api/audits/[auditId]', () => {

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('TC-S2-20: returns 401 when unauthenticated', async () => {
    const audit = await seedAudit({
      organizationId: org1Id,
      brandId:        brand1Id,
      auditNumber:    1,
      status:         'pending',
    });
    const { status } = await get(`/api/audits/${audit.id}`);
    expect(status).toBe(401);
  });

  // ── Response shape (P7 fix) ────────────────────────────────────────────────

  it('TC-S2-21: 200 response has correct shape: { audit: {...}, citationCount }', async () => {
    const audit = await seedAudit({
      organizationId: org1Id,
      brandId:        brand1Id,
      auditNumber:    1,
      status:         'pending',
    });

    const { status, body } = await getAudit(token1, audit.id);
    expect(status).toBe(200);

    const b = body as {
      audit: Record<string, unknown>;
      citationCount: number;
    };

    // Top-level keys
    expect(b.audit).toBeDefined();
    expect(typeof b.citationCount).toBe('number');

    // Required audit fields
    expect(b.audit.id).toBe(audit.id);
    expect(typeof b.audit.auditNumber).toBe('number');
    expect(b.audit.status).toBe('pending');
    expect(b.audit.scoreComposite).toBeNull();
    expect(b.audit.totalCostUsd).toBeNull();
    expect(b.audit.engines).toBeDefined();
    expect(typeof b.audit.metadata).toBe('object');
  });

  it('TC-S2-22: citationCount reflects actual citations rows in DB', async () => {
    const audit = await seedAudit({
      organizationId: org1Id,
      brandId:        brand1Id,
      auditNumber:    1,
      status:         'complete',
      scoreComposite: '70.00',
    });

    // Seed 3 citation rows manually
    for (let i = 0; i < 3; i++) {
      await testDb.insert(schema.citations).values({
        auditId:       audit.id,
        engine:        'chatgpt',
        prompt:        `Test prompt ${i}`,
        runNumber:     1,
        brandMentioned: i < 2, // 2 mentions, 1 not mentioned
        responseSnippet: `Response snippet ${i}`.slice(0, 500),
        citedSources:  [],
        contextSnippets: [],
      });
    }

    const { body } = await getAudit(token1, audit.id);
    const b = body as { citationCount: number };
    expect(b.citationCount).toBe(3);
  });

  it('TC-S2-23: completed audit response includes scoreComposite and completedAt', async () => {
    const audit = await seedAudit({
      organizationId: org1Id,
      brandId:        brand1Id,
      auditNumber:    1,
      status:         'complete',
      scoreComposite: '70.00',
      totalCostUsd:   '0.0500',
    });
    // Update completedAt
    await testDb
      .update(schema.audits)
      .set({ completedAt: new Date() })
      .where(eq(schema.audits.id, audit.id));

    const { body } = await getAudit(token1, audit.id);
    const b = body as { audit: Record<string, unknown> };
    expect(b.audit.status).toBe('complete');
    expect(b.audit.scoreComposite).toBeTruthy();
    expect(b.audit.completedAt).toBeTruthy();
    expect(b.audit.totalCostUsd).toBeTruthy();
  });

  // ── Cross-org isolation (CLAUDE.md §7) ────────────────────────────────────

  it('TC-S2-24: cross-org audit returns 404 (not 401) — CLAUDE.md §7', async () => {
    const org2Audit = await seedAudit({
      organizationId: org2Id,
      brandId:        brand2Id,
      auditNumber:    1,
    });

    // User 1 tries to GET org 2's audit
    const { status, body } = await getAudit(token1, org2Audit.id);
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    // Body must not leak audit data
    expect(JSON.stringify(body)).not.toContain(org2Id);
  });

  // ── Not found ─────────────────────────────────────────────────────────────

  it('TC-S2-25: non-existent auditId returns 404', async () => {
    const { status } = await getAudit(token1, '00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
  });
});
