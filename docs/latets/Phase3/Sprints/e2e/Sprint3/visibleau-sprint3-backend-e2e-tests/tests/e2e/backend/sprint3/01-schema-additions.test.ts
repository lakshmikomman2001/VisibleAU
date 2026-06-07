/**
 * tests/e2e/backend/sprint3/01-schema-additions.test.ts
 *
 * Verifies Sprint 3 schema additions applied correctly.
 * Sprint 3 §5 + AC3a: scoreSentiment and scoreContext are TEXT (not numeric).
 *
 * No Inngest required — pure DB inspection via service-role client.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { testDb, deleteCanaryPrompts } from './helpers/db';
import * as schema from '../../../../db/schema';
import { sql } from 'drizzle-orm';

beforeAll(async () => {
  await deleteCanaryPrompts(); // start clean
});

describe('Sprint 3 §5 — Schema additions', () => {

  // ── audits table new columns ───────────────────────────────────────────────

  it('TC-S3-01: audits table has score_frequency column (numeric)', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'score_frequency'
    `);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].data_type).toBe('numeric');
  });

  it('TC-S3-02: audits table has score_position column (numeric)', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'score_position'
    `);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].data_type).toBe('numeric');
  });

  it('TC-S3-03: AC3a — score_sentiment is TEXT not numeric (AB1 fix: categorical label)', async () => {
    // CRITICAL: Sprint 3 AB1 fix — scoreSentiment is a text label 'positive'|'neutral'|'negative'
    // NOT a numeric value. Any migration that created it as numeric is wrong.
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'score_sentiment'
    `);
    expect(rows.rows.length, 'score_sentiment column must exist').toBe(1);
    expect(rows.rows[0].data_type, 'AC3a: score_sentiment must be TEXT not numeric').toBe('text');
  });

  it('TC-S3-04: score_sentiment_numeric is numeric (companion column for composite math)', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'score_sentiment_numeric'
    `);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].data_type).toBe('numeric');
  });

  it('TC-S3-05: AC3a — score_context is TEXT not numeric (AB1 fix: categorical label)', async () => {
    // CRITICAL: same AB1 fix — scoreContext stores 'recommended'|'listed'|'mentioned'|'commodified'
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'score_context'
    `);
    expect(rows.rows.length, 'score_context column must exist').toBe(1);
    expect(rows.rows[0].data_type, 'AC3a: score_context must be TEXT not numeric').toBe('text');
  });

  it('TC-S3-06: score_context_numeric is numeric', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'score_context_numeric'
    `);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].data_type).toBe('numeric');
  });

  it('TC-S3-07: score_accuracy is numeric', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'score_accuracy'
    `);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].data_type).toBe('numeric');
  });

  it('TC-S3-08: score_confidence_low and score_confidence_high are numeric (AB2 fix)', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits'
        AND column_name IN ('score_confidence_low', 'score_confidence_high')
      ORDER BY column_name
    `);
    expect(rows.rows.length, 'Both confidence bound columns must exist (AB2 fix)').toBe(2);
    for (const row of rows.rows) {
      expect(row.data_type).toBe('numeric');
    }
  });

  it('TC-S3-09: confidence_intervals is jsonb', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'confidence_intervals'
    `);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].data_type).toBe('jsonb');
  });

  it('TC-S3-10: engine_count and prompt_count are integer columns (AB2 fix)', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audits'
        AND column_name IN ('engine_count', 'prompt_count')
      ORDER BY column_name
    `);
    expect(rows.rows.length, 'engine_count + prompt_count must exist (AB2 fix)').toBe(2);
    for (const row of rows.rows) {
      expect(row.data_type).toBe('integer');
    }
  });

  // ── canary_prompts table ───────────────────────────────────────────────────

  it('TC-S3-11: canary_prompts table exists with required columns', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'canary_prompts'
      ORDER BY column_name
    `);
    const cols = rows.rows.map((r: any) => r.column_name as string);
    expect(cols).toContain('id');
    expect(cols).toContain('prompt_text');
    expect(cols).toContain('engine');
    expect(cols).toContain('model');
    expect(cols).toContain('last_response_hash');
    expect(cols).toContain('drift_detected');
    expect(cols).toContain('last_checked_at');
  });

  it('TC-S3-12: canary_prompts.engine is text not enum (X4 fix — new engines via code not migration)', async () => {
    const rows = await testDb.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'canary_prompts' AND column_name = 'engine'
    `);
    expect(rows.rows.length).toBe(1);
    // X4 fix: engine must be stored as TEXT not a pgEnum
    // pgEnum would appear as 'USER-DEFINED' data_type — that would be wrong
    expect(rows.rows[0].data_type, 'X4 fix: engine must be text not pgEnum').toBe('text');
  });
});
