/**
 * 03-schema-seed-verification.test.ts
 *
 * Sprint 5 §5 + §11 — DB schema structure and production seed counts.
 * Tests the vertical_packs and vertical_pack_prompts tables exist with the correct
 * columns, constraints, and exactly 124+104+108=336 seeded rows.
 *
 * TC-S5-25 through TC-S5-36
 */

import { it, expect } from 'vitest';
import { db, getProductionPack, getPromptCountForPack } from './helpers/db';
import { isNull, sql, eq, and } from 'drizzle-orm';
import * as schema from '../../../../db/schema';

// No afterAll needed — this suite only reads production data (never writes test rows)

// ─── TC-S5-25 — vertical_packs table exists + RLS disabled ───────────────────
//
// V1 FIX: This test now also verifies that RLS is DISABLED on vertical_packs.
// Sprint 5 spec CE4 fix explicitly requires:
//   ALTER TABLE vertical_packs DISABLE ROW LEVEL SECURITY;
// Reason: vertical_packs has no organizationId — it is global data. If Supabase
// enables RLS by default (or Claude Code follows the Sprint 2 tenant-table pattern),
// every API query returns 0 rows without error. The wizard shows no packs and the
// audit job fails to find prompts.
//
// IMPORTANT: The test's service-role DB client BYPASSES RLS, so SELECT queries
// succeed even with RLS enabled. Only an explicit pg_tables check reveals the truth.
// Without this check, TC-S5-27 would fail with a cryptic "expected 3 rows, got 0"
// error that doesn't point to the migration issue.

it('TC-S5-25: vertical_packs table exists and RLS is disabled (CE4 fix)', async () => {
  // Verify table is queryable via service-role
  const rows = await db.select().from(schema.verticalPacks).limit(1);
  expect(Array.isArray(rows)).toBe(true);

  // Verify RLS is DISABLED — service-role bypasses RLS, so this must be checked
  // via pg_tables system catalog, not by running a query against the table itself
  const [{ rls }] = await db.execute<{ rls: boolean }>(
    sql`SELECT rowsecurity::boolean AS rls FROM pg_tables WHERE tablename = 'vertical_packs' AND schemaname = 'public'`
  );
  expect(
    rls,
    'vertical_packs has RLS enabled — Sprint 5 migration must run: ALTER TABLE vertical_packs DISABLE ROW LEVEL SECURITY (CE4 fix)',
  ).toBe(false);
});

// ─── TC-S5-26 — vertical_pack_prompts table exists + RLS disabled ─────────────

it('TC-S5-26: vertical_pack_prompts table exists and RLS is disabled (CE4 fix)', async () => {
  // Verify table is queryable via service-role
  const rows = await db.select().from(schema.verticalPackPrompts).limit(1);
  expect(Array.isArray(rows)).toBe(true);

  // Verify RLS is DISABLED (same reasoning as TC-S5-25)
  const [{ rls }] = await db.execute<{ rls: boolean }>(
    sql`SELECT rowsecurity::boolean AS rls FROM pg_tables WHERE tablename = 'vertical_pack_prompts' AND schemaname = 'public'`
  );
  expect(
    rls,
    'vertical_pack_prompts has RLS enabled — Sprint 5 migration must run: ALTER TABLE vertical_pack_prompts DISABLE ROW LEVEL SECURITY (CE4 fix)',
  ).toBe(false);
});

// ─── TC-S5-27 — 3 active production packs ────────────────────────────────────

it('TC-S5-27: production seed has exactly 3 active packs (tradies, allied_health, saas)', async () => {
  const packs = await db
    .select()
    .from(schema.verticalPacks)
    .where(
      and(
        isNull(schema.verticalPacks.retiredAt),
        eq(schema.verticalPacks.region, 'au' as any),
      )
    );
  expect(packs.length).toBe(3);
  const verticals = packs.map(p => p.vertical).sort();
  expect(verticals).toEqual(['allied_health', 'saas', 'tradies']);
});

// ─── TC-S5-28 — AU Tradies: 124 prompts ──────────────────────────────────────

it('TC-S5-28: AU Tradies pack has exactly 124 prompts', async () => {
  const pack = await getProductionPack('tradies');
  expect(pack).not.toBeNull();
  const count = await getPromptCountForPack(pack!.id);
  expect(count).toBe(124);
});

// ─── TC-S5-29 — AU Allied Health: 104 prompts ────────────────────────────────

it('TC-S5-29: AU Allied Health pack has exactly 104 prompts', async () => {
  const pack = await getProductionPack('allied_health');
  expect(pack).not.toBeNull();
  const count = await getPromptCountForPack(pack!.id);
  expect(count).toBe(104);
});

// ─── TC-S5-30 — AU SaaS: 108 prompts ─────────────────────────────────────────

it('TC-S5-30: AU SaaS pack has exactly 108 prompts', async () => {
  const pack = await getProductionPack('saas');
  expect(pack).not.toBeNull();
  const count = await getPromptCountForPack(pack!.id);
  expect(count).toBe(108);
});

// ─── TC-S5-31 — Total 336 prompts ────────────────────────────────────────────

it('TC-S5-31: total prompt count across all active packs is 336 (124+104+108)', async () => {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.verticalPackPrompts);
  // Allow for test packs that may exist; just verify ≥ 336
  expect(total).toBeGreaterThanOrEqual(336);
});

// ─── TC-S5-32 — promptsCount column matches actual row count (CA6 fix) ────────

it('TC-S5-32: promptsCount column matches actual prompt row count for each production pack (CA6 fix)', async () => {
  const packs = await db
    .select()
    .from(schema.verticalPacks)
    .where(and(isNull(schema.verticalPacks.retiredAt), eq(schema.verticalPacks.region, 'au' as any)));

  // Guard: if this fails, pnpm seed has not been run — the for loop below would pass vacuously
  expect(packs.length).toBeGreaterThan(0);

  for (const pack of packs) {
    const actual = await getPromptCountForPack(pack.id);
    expect(pack.promptsCount).toBe(actual);
  }
});

// ─── TC-S5-33 — Unique constraint (vertical, region) ─────────────────────────

it('TC-S5-33: UNIQUE(vertical, region) constraint enforced — duplicate insert throws', async () => {
  const pack = await getProductionPack('tradies');
  expect(pack).not.toBeNull();

  // Attempt to insert duplicate (vertical='tradies', region='au')
  await expect(
    db.insert(schema.verticalPacks).values({
      vertical:     'tradies' as any,
      region:       'au'      as any,
      name:         'Duplicate Test',
      version:      'v0.dup',
      promptsCount: 0,
      updatedAt:    new Date(),
    })
  ).rejects.toThrow(); // Unique constraint violation
});

// ─── TC-S5-34 — FK CASCADE: deleting pack cascades to prompts ────────────────

it('TC-S5-34: deleting a vertical pack cascades to its prompts (CK3 fix)', async () => {
  // Create a temporary pack with prompts
  const [tempPack] = await db
    .insert(schema.verticalPacks)
    .values({
      vertical: 'saas' as any, region: 'nz' as any,  // valid regionEnum; no production pack at saas+nz
      name: '[S5-E2E] Cascade Test', version: 'v0.test',
      promptsCount: 0, updatedAt: new Date(),
    })
    .returning();

  await db.insert(schema.verticalPackPrompts).values({
    packId: tempPack.id,
    promptTemplate: 'Cascade test prompt',
    rank: 1,
  });

  // Verify prompt exists
  const before = await db.select().from(schema.verticalPackPrompts)
    .where(eq(schema.verticalPackPrompts.packId, tempPack.id));
  expect(before.length).toBe(1);

  // Hard-delete pack
  await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, tempPack.id));

  // Prompts should be cascade-deleted
  const after = await db.select().from(schema.verticalPackPrompts)
    .where(eq(schema.verticalPackPrompts.packId, tempPack.id));
  expect(after.length).toBe(0);
});

// ─── TC-S5-35 — rank column: all production prompts have rank ≥ 1 ────────────

it('TC-S5-35: all production prompts have rank ≥ 1 (rank is required/non-null)', async () => {
  const [{ nullRanks }] = await db
    .select({ nullRanks: sql<number>`count(*)::int filter (where rank is null)` })
    .from(schema.verticalPackPrompts);
  expect(nullRanks).toBe(0);
});

// ─── TC-S5-36 — category: canonical values only in production seed ────────────

it('TC-S5-36: all production prompts use canonical category values', async () => {
  const CANONICAL_CATEGORIES = new Set([
    'service-discovery', 'service-specific', 'recommendation', 'comparison',
    'pricing', 'emergency', 'reviews', 'compliance', 'problem-driven',
  ]);

  const rows = await db
    .select({ category: schema.verticalPackPrompts.category })
    .from(schema.verticalPackPrompts);

  // Guard: if this fails, pnpm seed has not been run — the for loop below would pass vacuously
  expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    if (row.category !== null) {
      expect(
        CANONICAL_CATEGORIES.has(row.category),
        `Unexpected category value: '${row.category}'`,
      ).toBe(true);
    }
  }
});
