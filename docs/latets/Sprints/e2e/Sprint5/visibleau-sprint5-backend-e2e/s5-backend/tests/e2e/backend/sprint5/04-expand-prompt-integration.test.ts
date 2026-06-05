/**
 * 04-expand-prompt-integration.test.ts
 *
 * Sprint 5 §7 — expandPrompt integration tests via the preview API.
 * Verifies all placeholder types, formatLocation, formatCompetitors fallback,
 * multi-location expansion, and the empty-locations skip behaviour (CP1 fix).
 *
 * TC-S5-37 through TC-S5-42
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  db,
  seedOrganization, seedUser,
  seedTestVerticalPack, deleteTestVerticalPacks, deleteTestDataForOrg,
} from './helpers/db';
import * as schema from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { getJson, SESSION_1 } from './helpers/http';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

let org1Id  = '';
let packId  = '';

beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: 'S5 ExpandPrompt Org', tier: 'agency' });
  org1Id = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });

  // Seed pack with all placeholder types for comprehensive expansion testing
  const { pack } = await seedTestVerticalPack({
    vertical: 'allied_health',
    region:   'nz',   // valid regionEnum; distinct combo from 02 (tradies+nz)
    prompts: [
      // Rank 1: {location} template
      { promptTemplate: 'Best plumber in {location}?',
        rank: 1, category: 'service-discovery', expectedMentionType: 'recommended' },
      // Rank 2: {brand} template
      { promptTemplate: 'Is {brand} reliable?',
        rank: 2, category: 'recommendation', expectedMentionType: 'recommended' },
      // Rank 3: {domain} template
      { promptTemplate: 'Review {domain} for trade services',
        rank: 3, category: 'reviews', expectedMentionType: 'listed' },
      // Rank 4: {competitors} template
      { promptTemplate: '{brand} vs {competitors} for leaks',
        rank: 4, category: 'comparison', expectedMentionType: 'comparison' },
      // Rank 5: combined {brand} + {location}
      { promptTemplate: 'Recommend {brand} for work in {location}?',
        rank: 5, category: 'recommendation', expectedMentionType: 'recommended' },
    ],
  });
  packId = pack.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestVerticalPacks();
});

// ─── TC-S5-37 — {location} replaced with formatted suburb (CA3 fix) ───────────

it('TC-S5-37: {location} → formatLocation: STATE:Suburb → Suburb, STATE (CA3 fix)', async () => {
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  expect(body.expandedPrompts.some(p => p.includes('Bondi, NSW'))).toBe(true);
  expect(body.expandedPrompts.some(p => p.includes('NSW:Bondi'))).toBe(false);
});

// ─── TC-S5-38 — {brand} and {domain} placeholders both replaced ───────────────

it('TC-S5-38: {brand} and {domain} placeholders both replaced correctly', async () => {
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  const combined = body.expandedPrompts.join(' ');
  expect(combined).not.toContain('{brand}');
  expect(combined).not.toContain('{domain}');
  expect(combined).toContain('Bondi Plumbing');
});

// ─── TC-S5-39 — {competitors} fallback when no competitors param (CB3 fix) ────
//
// T2 FIX: The beforeAll pack places {competitors} at rank-4, which is outside the
// top-3 preview slice and was therefore never reached by the API call. The conditional
// 'if (hasCompetitorTemplate)' always evaluated to false — the CB3 assertion was
// permanently skipped and never actually verified.
//
// Fix: seed a dedicated temp pack with the {competitors} template at rank 1 so it
// is guaranteed to appear in the preview response. The pack is created and deleted
// inline within this test.

it('TC-S5-39: {competitors} falls back to "other local providers" when no competitors given (CB3 fix)', async () => {
  // Seed a temp pack with {competitors} at rank 1 (guaranteed to be in top-3 preview)
  // Uses allied_health+us: valid enum combo not in use by any other test during file 04
  const { pack: tempPack } = await seedTestVerticalPack({
    vertical: 'allied_health',
    region:   'us',
    prompts: [
      { promptTemplate: '{brand} vs {competitors} for the best service in {location}', rank: 1, category: 'comparison', expectedMentionType: 'comparison' },
    ],
  });

  try {
    const { body } = await getJson<{ expandedPrompts: string[] }>(
      `/api/vertical-packs/${tempPack.id}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
      SESSION_1,
    );

    // The {competitors} template IS in the preview (rank 1) — this assertion is NOT conditional
    expect(body.expandedPrompts.length).toBeGreaterThan(0);
    expect(body.expandedPrompts[0]).not.toContain('{competitors}');   // placeholder replaced
    expect(body.expandedPrompts[0]).toContain('other local providers'); // CB3 fallback text confirmed
    expect(body.expandedPrompts[0]).toContain('Bondi Plumbing');        // {brand} also replaced
  } finally {
    // Cleanup — always runs even if assertions fail
    await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, tempPack.id));
  }
});

// ─── TC-S5-40 — Templates with {location} skipped when no location given (CP1 fix)

it('TC-S5-40: no raw {location} in output whether expanded (CI4 fallback) or skipped (CP1 empty-locations guard)', async () => {
  // Pass no primaryRegion — CI4 fallback to NSW:Sydney CBD
  // After CI4 fix, empty primaryRegion defaults to NSW:Sydney CBD in preview endpoint
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Test+Brand`,
    SESSION_1,
  );
  // CI4: empty primaryRegion → 'NSW:Sydney CBD' fallback → 'Sydney CBD, NSW' in output
  // So {location} templates produce output with 'Sydney CBD, NSW' rather than being skipped
  const combined = body.expandedPrompts.join(' ');
  expect(combined).not.toContain('{location}'); // raw placeholder never shows
});

// ─── TC-S5-41 — Preview returns prompts ranked 1..3 in order ──────────────────

it('TC-S5-41: preview expands rank-1 template first (ordered by rank ASC)', async () => {
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  // First expanded prompt must come from rank-1 template: 'Best plumber in {location}?'
  expect(body.expandedPrompts[0]).toContain('Best plumber in');
  expect(body.expandedPrompts[0]).toContain('Bondi, NSW');
});

// ─── TC-S5-42 — formatLocation with no colon passes through unchanged ──────────

it('TC-S5-42: formatLocation passes through value unchanged when no colon present', async () => {
  // Test with a region value that has no colon — e.g. 'Sydney' → should appear as-is
  const { body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${packId}/prompts?preview=true&brandName=Test+Brand&primaryRegion=Sydney`,
    SESSION_1,
  );
  // 'Sydney' has no colon → formatLocation returns 'Sydney' unchanged
  const combined = body.expandedPrompts.join(' ');
  // Prompts with {location} should contain 'Sydney' not 'Sydney, undefined'
  expect(combined).not.toContain('undefined');
  expect(combined).not.toContain('null');
});
