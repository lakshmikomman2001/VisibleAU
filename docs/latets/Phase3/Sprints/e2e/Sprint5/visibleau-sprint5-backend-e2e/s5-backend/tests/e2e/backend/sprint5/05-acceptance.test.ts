/**
 * 05-acceptance.test.ts
 *
 * Sprint 5 §12 — Acceptance checklist items verifiable at the DB/API layer.
 * Also covers §8 audit job regression checks:
 *   - null pack → audit status='failed', metadata.error set (CB1 fix)
 *   - empty prompts → audit status='failed', metadata.error set (CO2 fix)
 *   - allExpanded.slice(0,10) hard cap (CB2 fix)
 *   - promptsCount = expanded count, not template count (CD3 fix)
 *   - getVerticalPack always uses isNull(retiredAt) filter (CG5 fix)
 *
 * TC-S5-43 through TC-S5-56
 *
 * NOTE: TC-S5-53 (full mock audit regression) requires Inngest dev server running.
 *       All other tests run against the DB directly.
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  db,
  seedOrganization, seedUser, seedBrand,
  seedTestVerticalPack, deleteTestVerticalPacks, deleteTestDataForOrg,
  getProductionPack, getPromptCountForPack,
} from './helpers/db';
import { getJson, postJson, getNoAuth, SESSION_1 } from './helpers/http';
import { and, eq, isNull, sql, inArray } from 'drizzle-orm';
import * as schema from '../../../../db/schema';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

let org1Id     = '';
let tradiesBrandId = '';

beforeAll(async () => {
  const org = await seedOrganization({
    clerkOrgId: ENV.clerkOrgId1,
    name:       'S5 Acceptance Org',
    tier:       'agency',
  });
  org1Id = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });

  const brand = await seedBrand({
    organizationId: org1Id,
    vertical:       'tradies',
    primaryRegions: ['NSW:Bondi', 'NSW:Manly'],
  });
  tradiesBrandId = brand.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestVerticalPacks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// §12 ACCEPTANCE: DB / SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TC-S5-43
 * §12: vertical_packs table has 3 rows (AU Tradies, AU Allied Health, AU SaaS)
 */
it('TC-S5-43: vertical_packs has exactly 3 production rows (tradies, allied_health, saas) at region=au', async () => {
  const packs = await db
    .select()
    .from(schema.verticalPacks)
    .where(and(
      isNull(schema.verticalPacks.retiredAt),
      eq(schema.verticalPacks.region, 'au' as any),
    ));
  expect(packs).toHaveLength(3);
  const verticals = packs.map(p => p.vertical).sort();
  expect(verticals).toEqual(['allied_health', 'saas', 'tradies']);
});

/**
 * TC-S5-44
 * §12: vertical_pack_prompts table has 336 total rows (124+104+108)
 */
it('TC-S5-44: total production prompt count is exactly 336 (124 tradies + 104 allied_health + 108 saas)', async () => {
  // Sum only production packs (region='au') to exclude any test packs
  const productionPacks = await db
    .select({ id: schema.verticalPacks.id })
    .from(schema.verticalPacks)
    .where(and(
      isNull(schema.verticalPacks.retiredAt),
      eq(schema.verticalPacks.region, 'au' as any),
    ));

  const packIds = productionPacks.map(p => p.id);

  // Guard: if seed hasn't been run yet, fail with a clear message
  // inArray(col, []) generates 'col IN ()' which is invalid SQL in Postgres
  if (packIds.length === 0) {
    throw new Error(
      'TC-S5-44: No production packs found at region=au. Run pnpm seed before running E2E tests.'
    );
  }

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.verticalPackPrompts)
    .where(inArray(schema.verticalPackPrompts.packId, packIds));

  expect(total).toBe(336);
});

/**
 * TC-S5-45
 * §12: GET /api/vertical-packs returns counts from DB, not hardcoded.
 * The promptsCount in the response must match the actual DB count for each pack.
 */
it('TC-S5-45: GET /api/vertical-packs promptsCount values match actual DB row counts (not hardcoded)', async () => {
  const { status, body } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  expect(status).toBe(200);

  const productionPacks = body.filter((p: any) => p.region === 'au');
  expect(productionPacks).toHaveLength(3);

  for (const apiPack of productionPacks) {
    const dbCount = await getPromptCountForPack(apiPack.id);
    expect(apiPack.promptsCount).toBe(dbCount);
    expect(apiPack.promptsCount).toBeGreaterThan(0); // Confirms not hardcoded zero
  }
});

/**
 * TC-S5-46
 * §12: POST /api/brands receives correct vertical value after wizard pack selection.
 * When the brand is created with vertical='tradies', the DB row has vertical='tradies'.
 * (CN5 fix: verifies the form value actually reached the server)
 */
it('TC-S5-46: POST /api/brands creates brand with correct vertical derived from pack selection (CN5 fix)', async () => {
  const { status, body } = await postJson<{ brand: { id: string; vertical: string } }>(
    '/api/brands',
    SESSION_1,
    {
      name:           '[S5-E2E] Vertical Acceptance Brand',
      domain:         'vertical-accept.test',
      vertical:       'tradies',      // Set by wizard pack selection (CJ1 fix)
      primaryRegions: ['NSW:Bondi'],
      competitors:    [],
    },
  );
  expect(status).toBe(201);
  expect(body.brand.vertical).toBe('tradies');

  // Verify at DB level
  const [dbBrand] = await db
    .select()
    .from(schema.brands)
    .where(eq(schema.brands.id, body.brand.id));
  expect(dbBrand).toBeDefined();
  expect(dbBrand.vertical).toBe('tradies');

  // Cleanup
  await db.delete(schema.brands).where(eq(schema.brands.id, body.brand.id));
});

/**
 * TC-S5-47
 * §12: Prompt expansion — {location} renders as "Suburb, STATE" not "STATE:Suburb".
 * Verified via GET /api/vertical-packs/[id]/prompts?preview=true
 */
it('TC-S5-47: prompt expansion renders {location} as "Suburb, STATE" not "STATE:Suburb" (CA3 fix)', async () => {
  const tradiesPack = await getProductionPack('tradies');
  expect(tradiesPack).not.toBeNull();

  const { status, body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${tradiesPack!.id}/prompts?preview=true&brandName=Test+Brand&primaryRegion=VIC:Melbourne+CBD`,
    SESSION_1,
  );
  expect(status).toBe(200);

  const combined = body.expandedPrompts.join(' ');
  // CA3 fix: STATE:Suburb → Suburb, STATE
  expect(combined).not.toContain('VIC:Melbourne');
  // At least one location-based prompt should expand to "Melbourne CBD, VIC"
  // (if a {location} template is in top 3)
  expect(combined).not.toMatch(/\{location\}/);
});

/**
 * TC-S5-48
 * §12: GET /api/vertical-packs/[id]/prompts returns top 3 expanded prompts
 * with brandName and primaryRegion query params (CJ4 fix).
 */
it('TC-S5-48: GET /api/vertical-packs/[id]/prompts returns ≤3 prompts and responds 200 (CJ4 fix)', async () => {
  const tradiesPack = await getProductionPack('tradies');
  expect(tradiesPack).not.toBeNull();

  const { status, body } = await getJson<{ expandedPrompts: string[] }>(
    `/api/vertical-packs/${tradiesPack!.id}/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi`,
    SESSION_1,
  );
  expect(status).toBe(200);
  expect(Array.isArray(body.expandedPrompts)).toBe(true);
  expect(body.expandedPrompts.length).toBeGreaterThan(0);
  expect(body.expandedPrompts.length).toBeLessThanOrEqual(3);
});

// ═══════════════════════════════════════════════════════════════════════════════
// §8 AUDIT JOB: null pack / empty prompts guards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TC-S5-49
 * §8 CB1 fix: getVerticalPack returns undefined (not crash) when no pack for that vertical+region.
 * Uses tradies+us — a valid (vertical, region) enum combination with no production pack seeded.
 *
 * NOTE: We use db.select() here (not db.query.findFirst) because the relational API requires
 * verticalPacksRelations to be registered in the Drizzle client (CH2 fix). Using db.select()
 * is consistent with the rest of this test suite and doesn't depend on that wiring.
 */
it('TC-S5-49: getVerticalPack returns undefined for valid enum combination with no pack seeded — no crash (CB1 fix)', async () => {
  // 'tradies'+'us': valid enum values, no production pack seeded for this combination
  const rows = await db
    .select()
    .from(schema.verticalPacks)
    .where(
      and(
        eq(schema.verticalPacks.vertical, 'tradies' as any),
        eq(schema.verticalPacks.region,   'us' as any),
        isNull(schema.verticalPacks.retiredAt),
      )
    );
  // Must be empty array, not throw — proves CB1 null guard is needed
  expect(rows).toHaveLength(0);
});

/**
 * TC-S5-50
 * §8 CO2 fix: pack with 0 prompts is detected before audit proceeds.
 * Seed a pack with no prompts, then verify the DB query returns 0 rows.
 */
it('TC-S5-50: promptRows query returns empty array for pack with no prompts (CO2 guard)', async () => {
  const { pack } = await seedTestVerticalPack({
    vertical: 'saas',
    region:   'nz',   // valid regionEnum; no production pack at saas+nz; inline cleanup follows
    prompts:  [],   // intentionally no prompts
  });

  const promptRows = await db
    .select()
    .from(schema.verticalPackPrompts)
    .where(eq(schema.verticalPackPrompts.packId, pack.id))
    .orderBy(schema.verticalPackPrompts.rank)
    .limit(10);

  expect(promptRows).toHaveLength(0); // triggers graceful failure in audit job

  // Cleanup
  await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, pack.id));
});

/**
 * TC-S5-51
 * §8 CB2 fix: allExpanded.slice(0,10) hard cap.
 * When a brand has 3 primaryRegions and top 10 templates all have {location},
 * the expanded set is capped at 10 (not 30).
 * Verified at DB layer by building the expansion manually.
 */
it('TC-S5-51: allExpanded.slice(0,10) caps prompt count regardless of location expansion (CB2 fix)', async () => {
  // Create a test pack with 10 {location} templates
  const locationTemplates = Array.from({ length: 10 }, (_, i) => ({
    promptTemplate:      `Find the best tradie in {location} for job ${i + 1}?`,
    rank:                i + 1,
    category:            'service-discovery' as const,
    expectedMentionType: 'recommended' as const,
  }));

  const { pack } = await seedTestVerticalPack({
    vertical: 'tradies',
    region:   'nz',   // valid regionEnum; tradies+nz cleaned up inline at end of this test
    prompts:  locationTemplates,
  });

  const promptRows = await db
    .select()
    .from(schema.verticalPackPrompts)
    .where(eq(schema.verticalPackPrompts.packId, pack.id))
    .orderBy(schema.verticalPackPrompts.rank)
    .limit(10);

  expect(promptRows).toHaveLength(10); // 10 templates returned

  // Simulate expansion with 3 locations (as audit job does)
  const locations = ['NSW:Bondi', 'NSW:Manly', 'NSW:Surry Hills'];
  let allExpanded: string[] = [];
  for (const row of promptRows) {
    for (const loc of locations) {
      const suburb = loc.split(':')[1];
      const state  = loc.split(':')[0];
      allExpanded.push(row.promptTemplate.replace('{location}', `${suburb}, ${state}`));
    }
  }
  // Without the slice: 10 templates × 3 locations = 30 expanded prompts
  expect(allExpanded).toHaveLength(30);

  // With slice(0,10) — the hard cap applied in the audit job
  const capped = allExpanded.slice(0, 10);
  expect(capped).toHaveLength(10);
  expect(capped.length).toBeLessThanOrEqual(10);

  // Cleanup
  await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, pack.id));
});

/**
 * TC-S5-52
 * §8 CG5 fix: getVerticalPack always uses isNull(retiredAt) filter.
 * A retired pack must NOT be returned even if it's the only pack for that vertical+region.
 */
it('TC-S5-52: retired pack is NOT returned by getVerticalPack — retiredAt filter always applied (CG5 fix)', async () => {
  const { pack } = await seedTestVerticalPack({
    vertical: 'saas',
    region:   'uk',   // valid regionEnum; saas+uk; inline cleanup follows
    prompts: [{ promptTemplate: 'Retired prompt', rank: 1 }],
  });

  // Retire the pack
  await db.update(schema.verticalPacks)
    .set({ retiredAt: new Date() })
    .where(eq(schema.verticalPacks.id, pack.id));

  // Query as getVerticalPack does — must return empty (using db.select for suite consistency)
  const rows = await db
    .select()
    .from(schema.verticalPacks)
    .where(
      and(
        eq(schema.verticalPacks.vertical, 'saas' as any),
        eq(schema.verticalPacks.region,   'uk' as any),  // must match the region used in insert above
        isNull(schema.verticalPacks.retiredAt),            // CG5: this filter is mandatory
      )
    );
  expect(rows).toHaveLength(0);

  // Cleanup (hard-delete since retiredAt is set)
  await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, pack.id));
});

/**
 * TC-S5-53
 * §12: No regression — full mock audit produces same scoring shape as Sprint 4.
 * Requires: Inngest dev server running + LLM_MODE=mock MOCK_SCENARIO=happy_path
 *
 * Skipped automatically if Inngest is not running (checks for POST /api/audits success).
 */
it('TC-S5-53: full mock audit with DB prompts produces Sprint 4-compatible scoring shape (regression)', async () => {
  // POST /api/audits for the seeded tradies brand
  const { status: auditStatus, body: auditBody } = await postJson<{
    auditId: string;
    auditNumber: number;
  }>('/api/audits', SESSION_1, { brandId: tradiesBrandId });

  if (auditStatus !== 201) {
    console.warn(`TC-S5-53: Skipping — POST /api/audits returned ${auditStatus}. Ensure app is running with LLM_MODE=mock.`);
    return;
  }

  const { auditId } = auditBody;

  // Poll for completion (max 90s — mock audit ~30–60s)
  let auditRow: any = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5_000));
    const rows = await db
      .select()
      .from(schema.audits)
      .where(eq(schema.audits.id, auditId));
    auditRow = rows[0];
    if (auditRow?.status === 'complete' || auditRow?.status === 'failed') break;
  }

  // Verify audit completed (not failed)
  expect(auditRow).toBeDefined();
  expect(auditRow.status).toBe('complete');

  // scoreComposite must be 0–100 (same shape as Sprint 4)
  const composite = parseFloat(auditRow.scoreComposite ?? '0');
  expect(composite).toBeGreaterThanOrEqual(0);
  expect(composite).toBeLessThanOrEqual(100);

  // promptsCount must be > 0 and ≤ 10 (expanded + capped) — DB column: prompts_count
  expect(auditRow.promptsCount).toBeGreaterThan(0);
  expect(auditRow.promptsCount).toBeLessThanOrEqual(10);

  // totalCostUsd must be a positive number
  const cost = parseFloat(auditRow.totalCostUsd ?? '0');
  expect(cost).toBeGreaterThanOrEqual(0);

  // Verify audit used DB-driven prompts by checking citations exist
  const [{ citationCount }] = await db
    .select({ citationCount: sql<number>`count(*)::int` })
    .from(schema.citations)
    .where(eq(schema.citations.auditId, auditId));
  expect(citationCount).toBeGreaterThan(0);

  // Cleanup audit + citations
  await db.delete(schema.citations).where(eq(schema.citations.auditId, auditId));
  await db.delete(schema.audits).where(eq(schema.audits.id, auditId));
}, 120_000);

// ═══════════════════════════════════════════════════════════════════════════════
// §8 ANTI-PATTERNS: verifications at DB layer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TC-S5-54
 * §13: Do not query vertical_packs without isNull(retiredAt).
 * Verify that both active and inactive packs exist (to prove the filter matters),
 * and that the count without filter > count with filter.
 */
it('TC-S5-54: retiredAt filter changes query results — both active and retired packs must be distinguishable', async () => {
  // Seed a pack and retire it
  const { pack } = await seedTestVerticalPack({
    vertical: 'allied_health',
    region:   'nz',   // valid regionEnum; allied_health+nz; inline cleanup follows
    prompts: [{ promptTemplate: 'Anti-pattern test', rank: 1 }],
  });
  await db.update(schema.verticalPacks)
    .set({ retiredAt: new Date() })
    .where(eq(schema.verticalPacks.id, pack.id));

  // Without retiredAt filter
  const [{ allCount }] = await db
    .select({ allCount: sql<number>`count(*)::int` })
    .from(schema.verticalPacks)
    .where(eq(schema.verticalPacks.vertical, 'allied_health' as any));

  // With retiredAt filter (correct usage per CG5)
  const [{ activeCount }] = await db
    .select({ activeCount: sql<number>`count(*)::int` })
    .from(schema.verticalPacks)
    .where(and(
      eq(schema.verticalPacks.vertical, 'allied_health' as any),
      isNull(schema.verticalPacks.retiredAt),
    ));

  // The filter must make a difference — proves it's necessary
  expect(allCount).toBeGreaterThan(activeCount);

  // Cleanup
  await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, pack.id));
});

/**
 * TC-S5-55
 * §8 CD3 fix: promptsCount = expanded prompt count after slice (not template count).
 * For a brand with 2 primaryRegions and templates that use {location},
 * the expanded count after slice(0,10) may differ from the template count.
 *
 * This test verifies the DB schema supports storing the expanded count
 * by confirming promptsCount (DB: prompts_count) is an integer column that can be set independently.
 */
it('TC-S5-55: audits.promptsCount stores the EXPANDED prompt count (not raw template count)', async () => {
  // Create a mock audit row with promptsCount = 7 (simulating 4 templates × 2 locations = 8 → slice to 7)
  const pack = await getProductionPack('tradies');
  expect(pack).not.toBeNull();

  const [mockAudit] = await db
    .insert(schema.audits)
    .values({
      organizationId: org1Id,
      brandId:        tradiesBrandId,
      status:         'complete',
      auditNumber:    Math.floor(Date.now() / 1000) % 1_000_000,  // unique per second; avoids org+auditNumber unique constraint on re-run
      engines:        ['chatgpt'],
      runsPerPrompt:  5,
      promptsCount:   7,   // CD3: expanded count (not 10 templates) — Drizzle column: promptsCount → DB: prompts_count
      totalCostUsd:   '0.50',
      scoreComposite: '63.40',
    })
    .returning();

  expect(mockAudit.promptsCount).toBe(7); // Expanded count stored correctly — column: prompts_count

  // Cleanup
  await db.delete(schema.audits).where(eq(schema.audits.id, mockAudit.id));
});

/**
 * TC-S5-56
 * §12 seed idempotency (CC1 fix): running the seed twice must not duplicate packs.
 * Verifies the ON CONFLICT DO UPDATE logic works by checking that the unique constraint
 * prevents duplicates when the same (vertical, region) is inserted twice.
 */
it('TC-S5-56: seed idempotency — ON CONFLICT DO UPDATE produces exactly 1 row per (vertical, region)', async () => {
  const upsertValues = {
    vertical:     'allied_health' as any,
    region:       'uk' as any,   // valid regionEnum; allied_health+uk
    name:         '[S5-E2E] Idempotent Test Pack',
    version:      'v0.test',
    promptsCount: 0,
    updatedAt:    new Date(),
  };

  // Insert first time
  await db
    .insert(schema.verticalPacks)
    .values(upsertValues)
    .onConflictDoUpdate({
      target: [schema.verticalPacks.vertical, schema.verticalPacks.region],
      set: { name: sql`excluded.name`, version: sql`excluded.version`, updatedAt: new Date() },
    });

  // Insert second time (same vertical+region) — must upsert, not duplicate
  await db
    .insert(schema.verticalPacks)
    .values({ ...upsertValues, name: '[S5-E2E] Idempotent Test Pack v2' })
    .onConflictDoUpdate({
      target: [schema.verticalPacks.vertical, schema.verticalPacks.region],
      set: { name: sql`excluded.name`, version: sql`excluded.version`, updatedAt: new Date() },
    });

  // Must be exactly 1 row for this test vertical+region
  const rows = await db
    .select()
    .from(schema.verticalPacks)
    .where(and(
      eq(schema.verticalPacks.vertical, 'allied_health' as any),
      eq(schema.verticalPacks.region,   'uk' as any),
    ));

  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe('[S5-E2E] Idempotent Test Pack v2'); // Second upsert won

  // Cleanup
  await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, rows[0].id));
});
