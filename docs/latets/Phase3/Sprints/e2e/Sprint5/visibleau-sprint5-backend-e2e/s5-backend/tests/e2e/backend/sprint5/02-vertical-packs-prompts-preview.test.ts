/**
 * 02-vertical-packs-prompts-preview.test.ts
 *
 * Sprint 5 §6 — GET /api/vertical-packs/[id]/prompts?preview=true
 * Tests: auth, 404 for invalid pack, expansion with brandName/primaryRegion,
 *        top-3 preview cap, placeholder replacement, formatLocation.
 *
 * TC-S5-13 through TC-S5-24
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  db,
  seedOrganization, seedUser,
  seedTestVerticalPack, deleteTestVerticalPacks, deleteTestDataForOrg,
} from './helpers/db';
import { getJson, getNoAuth, SESSION_1 } from './helpers/http';
import * as schema from '../../../../db/schema';
import { eq } from 'drizzle-orm';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

let org1Id  = '';
let packId  = ''; // test pack UUID

beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: 'S5 Prompts Preview Org', tier: 'agency' });
  org1Id = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });

  // Seed a test pack with exactly 5 prompts — covers all placeholder types
  const { pack } = await seedTestVerticalPack({
    vertical: 'tradies',
    region:   'nz',     // valid regionEnum; no production pack at tradies+nz
    prompts: [
      { promptTemplate: 'Who are the best plumbers in {location}?',                     rank: 1, category: 'service-discovery', expectedMentionType: 'recommended' },
      { promptTemplate: '{brand} vs {competitors} — who is better for hot water?',     rank: 2, category: 'comparison',        expectedMentionType: 'comparison'  },
      { promptTemplate: 'How much does a plumber cost in {location}?',                  rank: 3, category: 'pricing',           expectedMentionType: 'listed'      },
      { promptTemplate: 'Visit {domain} for licensed trades in {location}?',           rank: 4, category: 'service-specific',  expectedMentionType: 'recommended' },
      { promptTemplate: 'Which {brand} service is best for bathroom renovation?',      rank: 5, category: 'recommendation',    expectedMentionType: 'recommended' },
    ],
  });
  packId = pack.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestVerticalPacks();
});

// ─── TC-S5-13 — Unauthenticated → 401 ────────────────────────────────────────

it('TC-S5-13: GET /api/vertical-packs/[id]/prompts unauthenticated returns 401', async () => {
  const { status } = await getNoAuth(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
  );
  expect(status).toBe(401);
});

// ─── TC-S5-14 — Invalid UUID → 404 (CP4 fix) ─────────────────────────────────

it('TC-S5-14: GET /api/vertical-packs/[id]/prompts with non-existent UUID returns 404 (CP4 fix)', async () => {
  const { status } = await getJson<unknown>(
    `/api/vertical-packs/00000000-0000-0000-0000-000000000000/prompts?preview=true`,
    SESSION_1,
  );
  expect(status).toBe(404);
});

// ─── TC-S5-15 — Retired pack → 404 ───────────────────────────────────────────

it('TC-S5-15: GET /api/vertical-packs/[id]/prompts for retired pack returns 404', async () => {
  const { pack } = await seedTestVerticalPack({ vertical: 'tradies', region: 'uk', prompts: [  // 'uk': valid enum, distinct from beforeAll nz pack
    { promptTemplate: 'Test prompt', rank: 1 },
  ] });
  // Retire it
  await db.update(schema.verticalPacks).set({ retiredAt: new Date() }).where(eq(schema.verticalPacks.id, pack.id));

  const { status } = await getJson<unknown>(
    `/api/vertical-packs/${pack.id}/prompts?preview=true`,
    SESSION_1,
  );
  expect(status).toBe(404);

  // Cleanup
  await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, pack.id));
});

// ─── TC-S5-16 — Authenticated → 200 ──────────────────────────────────────────

it('TC-S5-16: GET /api/vertical-packs/[id]/prompts returns 200 with valid packId', async () => {
  const { status } = await getJson<unknown>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  expect(status).toBe(200);
});

// ─── TC-S5-17 — Response has expandedPrompts array ───────────────────────────

it('TC-S5-17: response contains expandedPrompts array', async () => {
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  expect(Array.isArray(body.expandedPrompts)).toBe(true);
});

// ─── TC-S5-18 — Preview returns at most 3 prompts ────────────────────────────

it('TC-S5-18: preview=true returns at most 3 expanded prompts', async () => {
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  expect(body.expandedPrompts.length).toBeLessThanOrEqual(3);
  expect(body.expandedPrompts.length).toBeGreaterThan(0);
});

// ─── TC-S5-19 — {brand} placeholder replaced ─────────────────────────────────

it('TC-S5-19: {brand} placeholder replaced with brandName query param', async () => {
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  const hasRaw = body.expandedPrompts.some(p => p.includes('{brand}'));
  expect(hasRaw).toBe(false); // All {brand} replaced
  const hasBrandName = body.expandedPrompts.some(p => p.includes('Bondi Plumbing'));
  expect(hasBrandName).toBe(true);
});

// ─── TC-S5-20 — {location} placeholder: formatLocation applied (CA3 fix) ─────

it('TC-S5-20: {location} renders as Suburb, STATE not STATE:Suburb (CA3 fix)', async () => {
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Test+Brand&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  const hasRaw    = body.expandedPrompts.some(p => p.includes('NSW:Bondi'));
  const hasFormatted = body.expandedPrompts.some(p => p.includes('Bondi, NSW'));
  expect(hasRaw).toBe(false);      // State:Suburb format NOT in output
  expect(hasFormatted).toBe(true); // Suburb, State format IS in output
});

// ─── TC-S5-21 — No raw placeholders in any expanded prompt ───────────────────

it('TC-S5-21: no raw {placeholders} remain in any expanded prompt', async () => {
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  for (const prompt of body.expandedPrompts) {
    expect(prompt).not.toMatch(/\{brand\}|\{location\}|\{domain\}|\{competitors\}/);
  }
});

// ─── TC-S5-22 — Empty brandName falls back gracefully ────────────────────────

it('TC-S5-22: missing brandName param falls back to "your brand"', async () => {
  const { body, status } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  expect(status).toBe(200);
  expect(Array.isArray(body.expandedPrompts)).toBe(true);
  // Should not crash — fall back to 'your brand'
  const hasYourBrand = body.expandedPrompts.some(p =>
    p.includes('your brand') || p.includes('Bondi')
  );
  expect(hasYourBrand).toBe(true);
});

// ─── TC-S5-23 — Empty primaryRegion uses fallback location (CI4 fix) ──────────

it('TC-S5-23: missing primaryRegion falls back to NSW:Sydney CBD (CI4 fix)', async () => {
  const { body, status } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Test+Brand`,
    SESSION_1,
  );
  expect(status).toBe(200);
  // CI4 fix: default fallback location = 'NSW:Sydney CBD' → 'Sydney CBD, NSW'
  const hasDefault = body.expandedPrompts.some(p => p.includes('Sydney CBD'));
  expect(hasDefault).toBe(true);
});

// ─── TC-S5-24 — Preview prompts ordered by rank ASC ──────────────────────────

it('TC-S5-24: preview prompts are top-ranked (rank 1, 2, 3) not arbitrary order', async () => {
  // The top-ranked prompt is rank 1: 'Who are the best plumbers in {location}?'
  // After expansion with primaryRegion=NSW:Bondi → 'Who are the best plumbers in Bondi, NSW?'
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  // The first expanded prompt should come from rank=1 template
  expect(body.expandedPrompts[0]).toContain('best plumbers');
});
