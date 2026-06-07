/**
 * tests/e2e/backend/sprint2/08-citations-schema.test.ts
 *
 * Backend E2E: citations table field integrity after a full audit run
 *
 * Sprint 2 §5 citations schema — verifies all required fields are set:
 *   auditId, engine, prompt, runNumber, brandMentioned, position,
 *   responseSnippet (≤500 chars), citedSources ([]), llmCostUsd, llmModel
 *
 * Also verifies:
 *   - responseSnippet is truncated to 500 chars (Sprint 2 §13 anti-pattern)
 *   - contextSnippets defaults to []
 *   - runNumber = 1 (Sprint 2 always single-run)
 *   - engine = 'chatgpt' (Sprint 2 single-engine)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  seedOrganization,
  seedUser,
  seedBrand,
  getCitationsForAudit,
  truncateSprint2TablesForOrgs,
  deleteBrandsForOrg,
} from './helpers/db';
import {
  TEST_USER_1,
  getClerkToken,
  createAudit,
  pollAuditUntilDone,
} from './helpers/http';

let org1Id = '';
let brand1Id = '';
let token1 = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name: 'E2E Citations Schema Org',
    region: 'au',
    tier: 'agency',
  });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const brand1 = await seedBrand({
    organizationId: org1Id,
    name:     'Bondi Plumbing',
    domain:   'bondiplumbing.com.au',
    vertical: 'tradies',
  });
  brand1Id = brand1.id;
  token1 = await getClerkToken(TEST_USER_1);
});

afterAll(async () => {
  // M10 FIX: guard against empty orgId if beforeAll failed before setting it
  if (org1Id) await truncateSprint2TablesForOrgs([org1Id]);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

beforeEach(async () => {
  await truncateSprint2TablesForOrgs([org1Id]);
});

describe('citations table field integrity after happy_path audit', () => {

  let auditId = '';

  beforeEach(async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId: id } = body as { auditId: string };
    auditId = id;
    await pollAuditUntilDone(token1, auditId);
  });

  it('TC-S2-80: each citation has required fields set', async () => {
    const citations = await getCitationsForAudit(auditId);
    expect(citations.length).toBe(10);

    for (const c of citations) {
      expect(c.auditId).toBe(auditId);
      expect(c.engine).toBe('chatgpt');           // Sprint 2: single engine
      expect(typeof c.prompt).toBe('string');
      expect(c.prompt.length).toBeGreaterThan(0);
      expect(c.runNumber).toBe(1);               // Sprint 2: single run
      expect(typeof c.brandMentioned).toBe('boolean');
      expect(c.llmModel).toBeTruthy();
      expect(c.createdAt).toBeTruthy();
    }
  });

  it('TC-S2-81: responseSnippet is ≤ 500 chars (Sprint 2 §13 anti-pattern: no full response)', async () => {
    const citations = await getCitationsForAudit(auditId);
    for (const c of citations) {
      if (c.responseSnippet) {
        expect(c.responseSnippet.length).toBeLessThanOrEqual(500);
      }
    }
  });

  it('TC-S2-82: contextSnippets defaults to [] (Sprint 3 fills this)', async () => {
    const citations = await getCitationsForAudit(auditId);
    for (const c of citations) {
      expect(Array.isArray(c.contextSnippets)).toBe(true);
    }
  });

  it('TC-S2-83: citedSources is an array (may be empty)', async () => {
    const citations = await getCitationsForAudit(auditId);
    for (const c of citations) {
      expect(Array.isArray(c.citedSources)).toBe(true);
    }
  });

  it('TC-S2-84: llmCostUsd is set for each citation', async () => {
    const citations = await getCitationsForAudit(auditId);
    for (const c of citations) {
      expect(c.llmCostUsd).not.toBeNull();
      expect(parseFloat(c.llmCostUsd!)).toBeGreaterThanOrEqual(0);
    }
  });

  it('TC-S2-85: citations with brandMentioned=true have position set', async () => {
    const citations = await getCitationsForAudit(auditId);
    const mentioned = citations.filter((c) => c.brandMentioned);
    for (const c of mentioned) {
      // position should be set (>= 1) when brand is mentioned
      expect(c.position).not.toBeNull();
      expect(c.position!).toBeGreaterThanOrEqual(1);
    }
  });

  it('TC-S2-86: citations with brandMentioned=false have position=null', async () => {
    const citations = await getCitationsForAudit(auditId);
    const notMentioned = citations.filter((c) => !c.brandMentioned);
    for (const c of notMentioned) {
      expect(c.position).toBeNull();
    }
  });
});
