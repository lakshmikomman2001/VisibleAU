/**
 * 04-action-items-detail.test.ts
 *
 * Sprint 6 §9 — GET /api/action-items/[id]  (DD5 fix)
 * Tests: shape (includes full evidenceRefs), 404 for missing,
 * 404 for cross-org, auth.
 *
 * TC-S6-36 through TC-S6-42
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItem, deleteTestDataForOrg,
} from './helpers/db';
import { getJson, getNoAuth, SESSION_1, SESSION_2 } from './helpers/http';
import * as schema from '../../../../db/schema';
import { eq, sql }  from 'drizzle-orm';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
  clerkOrgId2:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId2: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email2:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id    = '';
let org2Id    = '';
let brand1Id  = '';
let brand2Id  = '';
let audit1Id  = '';
let audit2Id  = '';
let item1Id   = '';

const evidenceRefs = [
  { source: 'Princeton GEO study (2024)', url: 'https://arxiv.org/abs/2404.11973',
    summary: 'Wikipedia = 47.9% of ChatGPT top-10 citation share.' },
  { source: 'SE Ranking Dec 2025', url: 'https://seranking.com',
    summary: 'FAQ pages average 4.9 citations vs 4.4 without.' },
];

beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-E2E] Detail Org1', tier: 'starter' });
  const org2 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S6-E2E] Detail Org2', tier: 'free' });
  org1Id = org1.id;
  org2Id = org2.id;

  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });

  const brand1 = await seedBrand({ organizationId: org1Id, name: '[S6-E2E] Detail Brand1' });
  const brand2 = await seedBrand({ organizationId: org2Id, name: '[S6-E2E] Detail Brand2', vertical: 'saas' });
  brand1Id = brand1.id;
  brand2Id = brand2.id;

  const audit1 = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  const audit2 = await seedAudit({ organizationId: org2Id, brandId: brand2Id });
  audit1Id = audit1.id;
  audit2Id = audit2.id;

  // Seed one item with full evidenceRefs for org1
  const item1 = await seedActionItem({
    organizationId:    org1Id,
    brandId:           brand1Id,
    auditId:           audit1Id,
    recommendationKey: 'wikipedia-article',
    dimension:         'frequency',
    title:             '[S6-E2E] Wikipedia Detail Test',
    action:            'Draft a Wikipedia article.',
    confidenceLabel:   'confirmed',
    expectedImpactScore: 'high',
    evidenceRefs,
  });
  item1Id = item1.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
});

// ─── TC-S6-36 — Unauthenticated → 401 ────────────────────────────────────────

it('TC-S6-36: GET /api/action-items/[id] unauthenticated returns 401', async () => {
  const { status } = await getNoAuth(`/api/action-items/${item1Id}`);
  expect(status).toBe(401);
});

// ─── TC-S6-37 — Valid item returns full shape ─────────────────────────────────

it('TC-S6-37: GET /api/action-items/[id] returns full item shape including evidenceRefs', async () => {
  const { status, body } = await getJson<any>(`/api/action-items/${item1Id}`, SESSION_1);
  expect(status).toBe(200);

  // All DA5 + DD5 fields
  expect(body.id).toBe(item1Id);
  expect(body.recommendationKey).toBe('wikipedia-article');
  expect(body.dimension).toBe('frequency');
  expect(body.title).toBe('[S6-E2E] Wikipedia Detail Test');
  expect(body.action).toBe('Draft a Wikipedia article.');
  expect(body.confidenceLabel).toBe('confirmed');
  expect(body.expectedImpactScore).toBe('high');
  expect(body.status).toBe('open');
  expect(body.brandId).toBe(brand1Id);
  expect(body.brandName).toBeDefined();
  expect(body.auditId).toBe(audit1Id);
  expect(body.createdAt).toBeDefined();
  expect(body.updatedAt).toBeDefined();
});

// ─── TC-S6-38 — evidenceRefs returned in full on detail endpoint ──────────────

it('TC-S6-38: evidenceRefs returned in full on GET /api/action-items/[id] (DD5)', async () => {
  const { body } = await getJson<any>(`/api/action-items/${item1Id}`, SESSION_1);

  expect(Array.isArray(body.evidenceRefs)).toBe(true);
  expect(body.evidenceRefs).toHaveLength(2);

  const ref0 = body.evidenceRefs[0];
  expect(ref0.source).toContain('Princeton');
  expect(ref0.url).toMatch(/arxiv/);
  expect(typeof ref0.summary).toBe('string');
  expect(ref0.summary.length).toBeGreaterThan(0);
});

// ─── TC-S6-39 — 404 for non-existent UUID ────────────────────────────────────

it('TC-S6-39: GET /api/action-items/[id] returns 404 for non-existent UUID', async () => {
  const { status } = await getJson<any>(
    '/api/action-items/00000000-0000-0000-0000-000000000000', SESSION_1
  );
  expect(status).toBe(404);
});

// ─── TC-S6-40 — 404 for cross-org access (RLS) ───────────────────────────────

it('TC-S6-40: GET /api/action-items/[id] returns 404 for cross-org item (RLS scoped)', async () => {
  // Item belongs to org1 — org2 user should get 404 (RLS: no rows visible → 404)
  const { status } = await getJson<any>(`/api/action-items/${item1Id}`, SESSION_2);
  expect(status).toBe(404);
});

// ─── TC-S6-41 — evidenceRefs immutability check ──────────────────────────────

it('TC-S6-41: evidenceRefs on detail page match what was written at generation time (DH5 immutability)', async () => {
  // PATCH the status — evidenceRefs must not change
  await db
    .update(schema.actionItems)
    .set({ status: 'in_progress' })
    .where(eq(schema.actionItems.id, item1Id));

  const { body } = await getJson<any>(`/api/action-items/${item1Id}`, SESSION_1);
  expect(body.status).toBe('in_progress');
  // evidenceRefs unchanged
  expect(body.evidenceRefs).toHaveLength(2);
  expect(body.evidenceRefs[0].source).toContain('Princeton');

  // Reset
  await db.update(schema.actionItems).set({ status: 'open' }).where(eq(schema.actionItems.id, item1Id));
});

// ─── TC-S6-42 — brandName included via JOIN ───────────────────────────────────

it('TC-S6-42: brandName in response comes from JOIN to brands table (not stored on action_items)', async () => {
  const { body } = await getJson<any>(`/api/action-items/${item1Id}`, SESSION_1);

  // Verify brand name matches what was seeded
  expect(typeof body.brandName).toBe('string');
  expect(body.brandName).toContain('[S6-E2E]');

  // Verify there is no brand_name column directly on action_items
  // A4 FIX: require() is not available in ESM context (vitest uses ESM).
  // sql is now imported at the top of this file.
  const cols = await db.execute<{ column_name: string }>(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'action_items'
      AND column_name = 'brand_name'
  `);
  expect(cols).toHaveLength(0);
});
