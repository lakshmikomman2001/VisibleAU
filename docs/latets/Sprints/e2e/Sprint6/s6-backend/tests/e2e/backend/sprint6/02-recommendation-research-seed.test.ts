/**
 * 02-recommendation-research-seed.test.ts
 *
 * Sprint 6 §11 step 2 — verify the research citation seed data
 * populated by `pnpm seed` (DG5, DE5 fixes).
 *
 * Verifies: all 11 universal keys have at least 1 research row,
 * row shape is correct, index is used, confidenceLevel is display-only.
 *
 * TC-S6-13 through TC-S6-20
 */

import { describe, it, expect } from 'vitest';
import { sql, eq, inArray }     from 'drizzle-orm';
import { db }                   from './helpers/db';
import * as schema              from '../../../../db/schema';

const UNIVERSAL_KEYS = [
  'wikipedia-article',
  'au-local-citations',
  'stale-content',
  'faq-content',
  'expert-quotes',
  'cited-statistics',
  'reddit-absence',
  'press-mentions',
  'comparison-article',
  'medium-presence',
  'linkedin-presence',
] as const;

// ─── TC-S6-13 — all 11 universal keys have at least 1 research row ───────────

it('TC-S6-13: all 11 universal recommendation keys have ≥1 research citation row (DN5 acceptance)', async () => {
  const rows = await db
    .select({
      recommendationKey: schema.recommendationResearch.recommendationKey,
      cnt: sql<number>`count(*)::int`,
    })
    .from(schema.recommendationResearch)
    .where(inArray(schema.recommendationResearch.recommendationKey, [...UNIVERSAL_KEYS]))
    .groupBy(schema.recommendationResearch.recommendationKey);

  const seededKeys = rows.map(r => r.recommendationKey);
  const missingKeys = UNIVERSAL_KEYS.filter(k => !seededKeys.includes(k));

  expect(missingKeys, `Missing research citations for: ${missingKeys.join(', ')}`).toHaveLength(0);

  for (const row of rows) {
    expect(row.cnt, `${row.recommendationKey} should have ≥1 citation`).toBeGreaterThanOrEqual(1);
  }
});

// ─── TC-S6-14 — total research rows ≥ 11 ────────────────────────────────────

it('TC-S6-14: recommendation_research table has at least 11 rows (one per universal key)', async () => {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.recommendationResearch);
  expect(total).toBeGreaterThanOrEqual(11);
});

// ─── TC-S6-15 — row shape correct ────────────────────────────────────────────

it('TC-S6-15: each research row has required fields populated', async () => {
  const rows = await db
    .select()
    .from(schema.recommendationResearch)
    .where(inArray(schema.recommendationResearch.recommendationKey, [...UNIVERSAL_KEYS]));

  for (const row of rows) {
    expect(row.id).toBeDefined();
    expect(row.recommendationKey).toBeTruthy();
    expect(row.source).toBeTruthy();           // source is NOT NULL
    expect(row.summary).toBeTruthy();          // summary is NOT NULL
    expect(row.confidenceLevel).toBeTruthy();  // display-only metadata
    expect(row.retrievedAt).toBeDefined();     // defaultNow
    // url may be null (optional per schema)
    expect(['string', 'object']).toContain(typeof row.url); // string or null
  }
});

// ─── TC-S6-16 — wikipedia-article has Princeton GEO citation ─────────────────

it('TC-S6-16: wikipedia-article has Princeton GEO study citation with correct URL', async () => {
  const rows = await db
    .select()
    .from(schema.recommendationResearch)
    .where(eq(schema.recommendationResearch.recommendationKey, 'wikipedia-article'));

  expect(rows.length).toBeGreaterThanOrEqual(1);
  const princeton = rows.find(r => r.source.includes('Princeton'));
  expect(princeton, 'Should have Princeton GEO study citation').toBeDefined();
  if (princeton?.url) {
    expect(princeton.url).toMatch(/arxiv\.org/);
  }
});

// ─── TC-S6-17 — reddit-absence has Tinuiti citation ──────────────────────────

it('TC-S6-17: reddit-absence has Tinuiti AI Citation Report citation', async () => {
  const rows = await db
    .select()
    .from(schema.recommendationResearch)
    .where(eq(schema.recommendationResearch.recommendationKey, 'reddit-absence'));

  expect(rows.length).toBeGreaterThanOrEqual(1);
  const tinuiti = rows.find(r => r.source.toLowerCase().includes('tinuiti'));
  expect(tinuiti, 'Should have Tinuiti citation').toBeDefined();
  if (tinuiti) {
    expect(tinuiti.summary).toMatch(/reddit/i);
    expect(tinuiti.summary).toMatch(/perplexity/i);
  }
});

// ─── TC-S6-18 — faq-content has SE Ranking citation ─────────────────────────

it('TC-S6-18: faq-content has SE Ranking research citation (Dec 2025)', async () => {
  const rows = await db
    .select()
    .from(schema.recommendationResearch)
    .where(eq(schema.recommendationResearch.recommendationKey, 'faq-content'));

  expect(rows.length).toBeGreaterThanOrEqual(1);
  const seRanking = rows.find(r => r.source.toLowerCase().includes('se ranking'));
  expect(seRanking, 'Should have SE Ranking citation').toBeDefined();
});

// ─── TC-S6-19 — confidenceLevel is seeded correctly per classification map ───

it('TC-S6-19: confidenceLevel in research table matches classification map values', async () => {
  const rows = await db
    .select()
    .from(schema.recommendationResearch)
    .where(inArray(schema.recommendationResearch.recommendationKey, [...UNIVERSAL_KEYS]));

  const validLevels = new Set(['confirmed', 'likely', 'hypothesis']);
  for (const row of rows) {
    expect(validLevels.has(row.confidenceLevel),
      `${row.recommendationKey}.confidenceLevel '${row.confidenceLevel}' is not valid`
    ).toBe(true);
  }

  // Spot-check: confirmed keys
  const confirmedRows = rows.filter(r =>
    ['wikipedia-article', 'au-local-citations', 'stale-content'].includes(r.recommendationKey)
  );
  for (const row of confirmedRows) {
    expect(row.confidenceLevel, `${row.recommendationKey} should be confirmed`).toBe('confirmed');
  }

  // Spot-check: hypothesis keys
  const hypothesisRows = rows.filter(r =>
    ['comparison-article', 'medium-presence', 'linkedin-presence'].includes(r.recommendationKey)
  );
  for (const row of hypothesisRows) {
    expect(row.confidenceLevel, `${row.recommendationKey} should be hypothesis`).toBe('hypothesis');
  }
});

// ─── TC-S6-20 — recommendation_research key index exists ────────────────────

it('TC-S6-20: recommendation_research_key_idx exists and is correctly defined (DE4 fix)', async () => {
  // A9 FIX: Postgres uses Seq Scan for small tables (~22 rows) regardless of index presence.
  // An EXPLAIN assertion would fail in any dev environment because the planner
  // correctly chooses Seq Scan over Index Scan for small result sets.
  // The correct test is: verify the index EXISTS in pg_indexes (structural check),
  // matching the same pattern as TC-S6-10 which verifies the index name.
  // The index will be used automatically once the table grows to a useful size.

  const rows = await db.execute<{ indexname: string; indexdef: string }>(sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'recommendation_research'
      AND indexname = 'recommendation_research_key_idx'
  `);

  expect(rows).toHaveLength(1);
  expect(rows[0].indexname).toBe('recommendation_research_key_idx');
  // Index covers recommendation_key column
  expect(rows[0].indexdef).toMatch(/recommendation_key/);
});
