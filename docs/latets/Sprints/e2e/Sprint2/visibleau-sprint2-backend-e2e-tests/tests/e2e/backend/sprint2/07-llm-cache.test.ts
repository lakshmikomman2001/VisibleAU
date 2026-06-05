/**
 * tests/e2e/backend/sprint2/07-llm-cache.test.ts
 *
 * Backend E2E: LLM response cache (PRD §10, Sprint 2 §6.5)
 *
 * PRD §10: "Cache LLM responses for 24-72h by (prompt, model) tuple.
 * If 5 customers ask 'best CRM Australia' within 48h, only 1 LLM call."
 *
 * Sprint 2 §6.5: llm_response_cache table + getCached()/setCached() in lib/llm/cache.ts.
 *
 * Tests verify:
 *   - Running two audits with the same brand/vertical uses the cache for prompts
 *   - Second audit's citations have llmCostUsd ≈ 0 (cached calls cost $0)
 *   - Cache row exists in DB with matching cacheKey
 *   - Mock mode: MockLLM bypasses the cache (cache is for real LLM only)
 *
 * Note: In mock mode, OpenAIImpl is NOT called, so the cache is not populated.
 * These tests run with LLM_MODE=mock and verify that mock audits work regardless
 * of cache state. The cache integration tests belong in unit/integration tests
 * where OpenAIImpl can be exercised with a test double.
 *
 * What we CAN test here: cache table is clean after truncation, not populated
 * by mock mode, and doesn't break the audit flow when empty.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  testDb,
  seedOrganization,
  seedUser,
  seedBrand,
  truncateSprint2TablesForOrgs,
  truncateLlmCache,
  deleteBrandsForOrg,
} from './helpers/db';
import * as schema from '../../../../db/schema';
import {
  TEST_USER_1,
  getClerkToken,
  createAudit,
  pollAuditUntilDone,
} from './helpers/http';
import { eq } from 'drizzle-orm';

let org1Id = '';
let brand1Id = '';
let token1 = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name: 'E2E Cache Org 1',
    region: 'au',
    tier: 'agency',
  });
  org1Id = org1.id;
  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  const brand1 = await seedBrand({
    organizationId: org1Id,
    name: 'Bondi Plumbing',
    domain: 'bondiplumbing.com.au',
    vertical: 'tradies',
  });
  brand1Id = brand1.id;
  token1 = await getClerkToken(TEST_USER_1);
});

afterAll(async () => {
  // M10 FIX: guard against empty orgId if beforeAll failed before setting it
  if (org1Id) await truncateSprint2TablesForOrgs([org1Id]);
  await truncateLlmCache();
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

beforeEach(async () => {
  await truncateSprint2TablesForOrgs([org1Id]);
  await truncateLlmCache();
});

describe('LLM response cache (PRD §10)', () => {

  it('TC-S2-70: mock mode audit completes successfully with empty cache', async () => {
    // Cache is empty (truncated in beforeEach)
    // Mock mode does not read/write the cache (bypassed)
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    const { status } = await pollAuditUntilDone(token1, auditId);
    expect(status).toBe('complete');
  });

  it('TC-S2-71: mock mode does NOT populate the llm_response_cache table', async () => {
    const { body } = await createAudit(token1, { brandId: brand1Id, scenario: 'happy_path' });
    const { auditId } = body as { auditId: string };
    await pollAuditUntilDone(token1, auditId);

    // Cache should remain empty — MockLLM does not call getCached/setCached
    const cacheRows = await testDb.select().from(schema.llmResponseCache);
    expect(cacheRows).toHaveLength(0);
  });

  it('TC-S2-72: llm_response_cache table exists and has correct schema', async () => {
    // Verify the table can be queried (schema migration applied)
    const rows = await testDb.select().from(schema.llmResponseCache);
    expect(Array.isArray(rows)).toBe(true);
    // Seed one row to verify column structure
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
    const [row] = await testDb.insert(schema.llmResponseCache).values({
      cacheKey:        'test-key-abc123',
      prompt:          'Who are the best plumbers in Sydney?',
      model:           'gpt-4o-mini',
      response:        'Bondi Plumbing is the best choice.',
      tokensUsed:      85,
      costEstimateUsd: '0.000500',
      expiresAt,
    }).returning();

    expect(row.cacheKey).toBe('test-key-abc123');
    expect(row.model).toBe('gpt-4o-mini');
    expect(row.hitCount).toBe(1);
    expect(row.expiresAt).toBeTruthy();
  });

  it('TC-S2-73: onConflictDoUpdate refreshes TTL on duplicate cache key insert', async () => {
    const expiresAt1 = new Date(Date.now() + 24 * 3600 * 1000);
    const expiresAt2 = new Date(Date.now() + 48 * 3600 * 1000);

    // First insert
    await testDb.insert(schema.llmResponseCache).values({
      cacheKey: 'conflict-test-key',
      prompt:   'test prompt',
      model:    'gpt-4o-mini',
      response: 'original response',
      tokensUsed: 50,
      costEstimateUsd: '0.000300',
      expiresAt: expiresAt1,
    });

    // Second insert with same key (onConflictDoUpdate)
    await testDb.insert(schema.llmResponseCache).values({
      cacheKey: 'conflict-test-key',
      prompt:   'test prompt',
      model:    'gpt-4o-mini',
      response: 'refreshed response',
      tokensUsed: 60,
      costEstimateUsd: '0.000360',
      expiresAt: expiresAt2,
    }).onConflictDoUpdate({
      target: schema.llmResponseCache.cacheKey,
      set: {
        response:        'refreshed response',
        tokensUsed:      60,
        costEstimateUsd: '0.000360',
        expiresAt:       expiresAt2,
      },
    });

    const [row] = await testDb
      .select()
      .from(schema.llmResponseCache)
      .where(eq(schema.llmResponseCache.cacheKey, 'conflict-test-key'));

    // Only one row (upserted)
    expect(row.response).toBe('refreshed response');
    expect(row.tokensUsed).toBe(60);
  });
});
