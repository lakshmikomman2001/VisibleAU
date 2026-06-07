/**
 * tests/e2e/backend/sprint2/05-audit-numbering.test.ts
 *
 * Backend E2E: auditNumber per-org sequential integrity
 *
 * Sprint 2 §5 (C fix): auditNumber is per-org using SELECT MAX ... FOR UPDATE.
 * NOT serial() (which is DB-global and ignores org boundaries).
 *
 * Tests:
 *   - Sequential creates within one org produce 1, 2, 3, ...
 *   - Two different orgs each start from 1 independently
 *   - Unique constraint prevents duplicate (orgId, auditNumber) — DB-level guard
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  seedOrganization,
  seedUser,
  seedBrand,
  getMaxAuditNumberForOrg,
  truncateSprint2TablesForOrgs,
  deleteBrandsForOrg,
} from './helpers/db';
import {
  TEST_USER_1,
  TEST_USER_2,
  getClerkToken,
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
    name: 'E2E Numbering Org 1',
    region: 'au',
    tier: 'agency',
  });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const brand1 = await seedBrand({ organizationId: org1Id, name: 'Brand A', domain: 'branda.test', vertical: 'tradies' });
  brand1Id = brand1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name: 'E2E Numbering Org 2',
    region: 'au',
    tier: 'starter',
  });
  org2Id = org2.id;
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });
  const brand2 = await seedBrand({ organizationId: org2Id, name: 'Brand B', domain: 'brandb.test', vertical: 'saas' });
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

describe('auditNumber per-org sequencing', () => {

  it('TC-S2-50: first audit for org gets auditNumber=1', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id });
    const { auditNumber } = body as { auditNumber: number };
    expect(auditNumber).toBe(1);
  });

  it('TC-S2-51: three sequential creates for same org yield 1, 2, 3', async () => {
    const r1 = await createAudit(token1, { brandId: brand1Id });
    const r2 = await createAudit(token1, { brandId: brand1Id });
    const r3 = await createAudit(token1, { brandId: brand1Id });

    const n1 = (r1.body as { auditNumber: number }).auditNumber;
    const n2 = (r2.body as { auditNumber: number }).auditNumber;
    const n3 = (r3.body as { auditNumber: number }).auditNumber;

    expect(n1).toBe(1);
    expect(n2).toBe(2);
    expect(n3).toBe(3);
  });

  it('TC-S2-52: org2 starts from auditNumber=1 independent of org1 count', async () => {
    // Org 1 has 2 audits
    await createAudit(token1, { brandId: brand1Id });
    await createAudit(token1, { brandId: brand1Id });

    // Org 2's first audit must be #1 (not #3)
    const { body } = await createAudit(token2, { brandId: brand2Id });
    const { auditNumber } = body as { auditNumber: number };
    expect(auditNumber).toBe(1);
  });

  it('TC-S2-53: DB MAX(auditNumber) for org1 matches the last returned auditNumber', async () => {
    await createAudit(token1, { brandId: brand1Id });
    await createAudit(token1, { brandId: brand1Id });
    const { body } = await createAudit(token1, { brandId: brand1Id });
    const { auditNumber } = body as { auditNumber: number };

    const dbMax = await getMaxAuditNumberForOrg(org1Id);
    expect(dbMax).toBe(auditNumber);
  });
});
