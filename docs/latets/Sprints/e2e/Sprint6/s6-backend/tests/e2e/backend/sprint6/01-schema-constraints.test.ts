/**
 * 01-schema-constraints.test.ts
 *
 * Sprint 6 §5 — DB schema validation for action_items and recommendation_research.
 * Verifies: table existence, column constraints, unique index, RLS config, FK behaviour.
 *
 * TC-S6-01 through TC-S6-12
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql, and }                               from 'drizzle-orm';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit, seedActionItem,
  deleteTestDataForOrg,
} from './helpers/db';
import * as schema from '../../../../db/schema';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};

let org1Id   = '';
let brand1Id = '';
let audit1Id = '';

beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-E2E] Schema Test Org', tier: 'starter' });
  org1Id = org1.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand = await seedBrand({ organizationId: org1Id, vertical: 'tradies' });
  brand1Id = brand.id;
  const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  audit1Id = audit.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
});

// ─── TC-S6-01 — action_items table exists ────────────────────────────────────

it('TC-S6-01: action_items table exists in public schema', async () => {
  const [row] = await db.execute<{ table_name: string }>(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'action_items'
  `);
  expect(row?.table_name).toBe('action_items');
});

// ─── TC-S6-02 — recommendation_research table exists ─────────────────────────

it('TC-S6-02: recommendation_research table exists in public schema', async () => {
  const [row] = await db.execute<{ table_name: string }>(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recommendation_research'
  `);
  expect(row?.table_name).toBe('recommendation_research');
});

// ─── TC-S6-03 — action_items NOT NULL columns ─────────────────────────────────

it('TC-S6-03: action_items required NOT NULL columns all exist with correct constraint', async () => {
  const rows = await db.execute<{ column_name: string; is_nullable: string }>(sql`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'action_items'
    ORDER BY column_name
  `);

  const columnMap = Object.fromEntries(rows.map(r => [r.column_name, r.is_nullable]));

  // Required NOT NULL per §5 schema (DM4: expectedImpactScore must be NOT NULL)
  const requiredNotNull = [
    'organization_id', 'brand_id', 'audit_id', 'recommendation_key',
    'dimension', 'title', 'action', 'confidence_label',
    'expected_impact_score',  // DM4 fix: was nullable, must be NOT NULL
    'evidence_refs', 'status', 'created_at', 'updated_at',
  ];
  for (const col of requiredNotNull) {
    expect(columnMap[col], `${col} should be NOT NULL`).toBe('NO');
  }

  // Nullable fields
  const nullable = ['dismissed_reason', 'done_at', 'dismissed_at'];
  for (const col of nullable) {
    expect(columnMap[col], `${col} should be nullable`).toBe('YES');
  }
});

// ─── TC-S6-04 — unique index (auditId, recommendationKey) ────────────────────

it('TC-S6-04: action_items_audit_rec_idx unique index exists (DC3 fix)', async () => {
  const [row] = await db.execute<{ indexname: string; indexdef: string }>(sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'action_items'
      AND indexname = 'action_items_audit_rec_idx'
  `);
  expect(row?.indexname).toBe('action_items_audit_rec_idx');
  expect(row?.indexdef).toMatch(/unique/i);
  expect(row?.indexdef).toMatch(/audit_id/);
  expect(row?.indexdef).toMatch(/recommendation_key/);
});

// ─── TC-S6-05 — unique index enforces idempotency ────────────────────────────

it('TC-S6-05: inserting duplicate (auditId, recommendationKey) fails with unique violation', async () => {
  // First insert
  await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'test-unique-key',
  });

  // Second insert — should fail
  await expect(
    db.insert(schema.actionItems).values({
      organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
      recommendationKey:  'test-unique-key',
      dimension:          'frequency',
      title:              'Duplicate',
      action:             'Duplicate action',
      confidenceLabel:    'confirmed',
      expectedImpactScore: 'high',
      evidenceRefs:       [],
      status:             'open',
    })
  ).rejects.toThrow();

  // Cleanup inline
  await db.delete(schema.actionItems).where(
    and(
      eq(schema.actionItems.auditId, audit1Id),
      eq(schema.actionItems.recommendationKey, 'test-unique-key')
    )
  );
});

// ─── TC-S6-06 — onConflictDoNothing is idempotent ────────────────────────────

it('TC-S6-06: onConflictDoNothing makes Inngest retries idempotent (DD3 fix)', async () => {
  const key = 'idempotency-test-key';

  await db.insert(schema.actionItems).values({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: key, dimension: 'frequency',
    title: 'Idempotency test', action: 'Test action.',
    confidenceLabel: 'likely', expectedImpactScore: 'medium',
    evidenceRefs: [], status: 'open',
  }).onConflictDoNothing();

  // Second insert with same (auditId, key) — must not throw
  await expect(
    db.insert(schema.actionItems).values({
      organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
      recommendationKey: key, dimension: 'frequency',
      title: 'Idempotency test (retry)', action: 'Test action retry.',
      confidenceLabel: 'likely', expectedImpactScore: 'medium',
      evidenceRefs: [], status: 'open',
    }).onConflictDoNothing()
  ).resolves.not.toThrow();

  // Only one row exists
  const rows = await db.select().from(schema.actionItems).where(
    and(eq(schema.actionItems.auditId, audit1Id), eq(schema.actionItems.recommendationKey, key))
  );
  expect(rows).toHaveLength(1);

  await db.delete(schema.actionItems).where(
    and(eq(schema.actionItems.auditId, audit1Id), eq(schema.actionItems.recommendationKey, key))
  );
});

// ─── TC-S6-07 — RLS enabled on action_items ──────────────────────────────────

it('TC-S6-07: action_items has RLS enabled (DH3 fix)', async () => {
  const [row] = await db.execute<{ tablename: string; rowsecurity: boolean }>(sql`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'action_items'
  `);
  expect(row?.rowsecurity).toBe(true);
});

// ─── TC-S6-08 — RLS disabled on recommendation_research ──────────────────────

it('TC-S6-08: recommendation_research has RLS DISABLED — global operator data (DH3 fix)', async () => {
  const [row] = await db.execute<{ tablename: string; rowsecurity: boolean }>(sql`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'recommendation_research'
  `);
  expect(row?.rowsecurity).toBe(false);
});

// ─── TC-S6-09 — RLS policy exists on action_items ────────────────────────────

it('TC-S6-09: org_isolation RLS policy exists on action_items', async () => {
  const rows = await db.execute<{ policyname: string; cmd: string }>(sql`
    SELECT policyname, cmd FROM pg_policies
    WHERE tablename = 'action_items' AND schemaname = 'public'
  `);
  const policy = rows.find(r => r.policyname === 'org_isolation');
  expect(policy).toBeDefined();
});

// ─── TC-S6-10 — recommendation_research index exists ─────────────────────────

it('TC-S6-10: recommendation_research_key_idx exists on recommendation_key (DE4 fix)', async () => {
  const [row] = await db.execute<{ indexname: string }>(sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'recommendation_research'
      AND indexname = 'recommendation_research_key_idx'
  `);
  expect(row?.indexname).toBe('recommendation_research_key_idx');
});

// ─── TC-S6-11 — action_items status default is 'open' ────────────────────────

it('TC-S6-11: action_items.status default is open', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'default-status-test',
  });
  expect(item.status).toBe('open');

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── TC-S6-12 — evidenceRefs default is [] ───────────────────────────────────

it('TC-S6-12: action_items.evidenceRefs defaults to empty array when not provided', async () => {
  const [item] = await db.insert(schema.actionItems).values({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey:  'evidence-default-test',
    dimension:          'frequency',
    title:              'Test',
    action:             'Test action',
    confidenceLabel:    'confirmed',
    expectedImpactScore: 'high',
    // evidenceRefs omitted — should use default '[]'
    status:             'open',
  }).returning();

  expect(Array.isArray(item.evidenceRefs)).toBe(true);
  expect(item.evidenceRefs).toHaveLength(0);

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});
