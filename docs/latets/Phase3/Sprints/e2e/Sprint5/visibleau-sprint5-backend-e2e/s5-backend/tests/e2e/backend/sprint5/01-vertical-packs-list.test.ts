/**
 * 01-vertical-packs-list.test.ts
 *
 * Sprint 5 §6 — GET /api/vertical-packs
 * Tests: response shape, active-only filter, ordering, brandsCount, auth, RLS global.
 *
 * TC-S5-01 through TC-S5-12
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  db,
  seedOrganization, seedUser, seedBrand,
  seedTestVerticalPack, deleteTestVerticalPacks, deleteTestDataForOrg,
} from './helpers/db';
import { getJson, getNoAuth, SESSION_1, SESSION_2 } from './helpers/http';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../../../db/schema';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
  clerkOrgId2:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId2: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email2:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id = '';
let org2Id = '';
let org1BrandId = '';

beforeAll(async () => {
  // Seed orgs and users
  const org1 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: 'S5 VP List Org1', tier: 'agency' });
  const org2 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: 'S5 VP List Org2', tier: 'free' });
  org1Id = org1.id;
  org2Id = org2.id;

  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });

  // Seed a brand for Org1 with vertical=tradies so brandsCount is verifiable
  const brand = await seedBrand({ organizationId: org1Id, vertical: 'tradies', primaryRegions: ['NSW:Bondi'] });
  org1BrandId = brand.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
  await deleteTestVerticalPacks();
});

// ─── TC-S5-01 — Unauthenticated → 401 ────────────────────────────────────────

it('TC-S5-01: GET /api/vertical-packs unauthenticated returns 401', async () => {
  const { status } = await getNoAuth('/api/vertical-packs');
  expect(status).toBe(401);
});

// ─── TC-S5-02 — Authenticated → 200 ──────────────────────────────────────────

it('TC-S5-02: GET /api/vertical-packs authenticated returns 200', async () => {
  const { status } = await getJson<unknown[]>('/api/vertical-packs', SESSION_1);
  expect(status).toBe(200);
});

// ─── TC-S5-03 — Response is array ────────────────────────────────────────────

it('TC-S5-03: GET /api/vertical-packs returns an array', async () => {
  const { body } = await getJson<unknown[]>('/api/vertical-packs', SESSION_1);
  expect(Array.isArray(body)).toBe(true);
});

// ─── TC-S5-04 — Production seed: exactly 3 active packs ──────────────────────

it('TC-S5-04: GET /api/vertical-packs returns exactly 3 active packs (production seed)', async () => {
  const { body } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  // Production seed: tradies, allied_health, saas — all retiredAt IS NULL
  const verticals = body.map((p: any) => p.vertical).sort();
  expect(verticals).toContain('tradies');
  expect(verticals).toContain('allied_health');
  expect(verticals).toContain('saas');
  // Filter production packs by region='au' — test packs use 'nz'/'uk' (valid enum, no au production conflict)
  const productionPacks = body.filter((p: any) => p.region === 'au');
  expect(productionPacks.length).toBe(3);
});

// ─── TC-S5-05 — Response shape per pack ──────────────────────────────────────

it('TC-S5-05: each pack in response has required fields', async () => {
  const { body } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  const productionPacks = body.filter((p: any) => p.region === 'au');
  for (const pack of productionPacks) {
    expect(typeof pack.id).toBe('string');
    expect(typeof pack.name).toBe('string');
    expect(typeof pack.vertical).toBe('string');
    expect(typeof pack.region).toBe('string');
    expect(typeof pack.version).toBe('string');
    expect(typeof pack.promptsCount).toBe('number');
    expect(typeof pack.publishedAt).toBe('string');
    expect(typeof pack.updatedAt).toBe('string');
    expect(typeof pack.brandsCount).toBe('number');
  }
});

// ─── TC-S5-06 — promptsCount matches DB ──────────────────────────────────────

it('TC-S5-06: promptsCount in response matches actual DB row count', async () => {
  const { body } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  const tradiesPack = body.find((p: any) => p.vertical === 'tradies' && p.region === 'au');
  expect(tradiesPack).toBeDefined();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.verticalPackPrompts)
    .where(eq(schema.verticalPackPrompts.packId, tradiesPack.id));
  expect(tradiesPack.promptsCount).toBe(count);
});

// ─── TC-S5-07 — Ordered by vertical ASC ──────────────────────────────────────

it('TC-S5-07: packs returned ordered by vertical ASC', async () => {
  const { body } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  const productionPacks = body.filter((p: any) => p.region === 'au');
  const verticals = productionPacks.map((p: any) => p.vertical);
  const sorted = [...verticals].sort();
  expect(verticals).toEqual(sorted);
});

// ─── TC-S5-08 — Retired pack excluded ────────────────────────────────────────

it('TC-S5-08: retired vertical pack is excluded from response', async () => {
  // Seed a test pack and then retire it
  const { pack } = await seedTestVerticalPack({ vertical: 'tradies', region: 'nz' })  // 'nz' is a valid regionEnum value; no production pack at tradies+nz;

  // Retire it
  await db.update(schema.verticalPacks)
    .set({ retiredAt: new Date() })
    .where(eq(schema.verticalPacks.id, pack.id));

  const { body } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  const retired = body.find((p: any) => p.id === pack.id);
  expect(retired).toBeUndefined();

  // Cleanup
  await db.delete(schema.verticalPacks).where(eq(schema.verticalPacks.id, pack.id));
});

// ─── TC-S5-09 — brandsCount is org-scoped (org1 has 1 tradies brand) ─────────

it('TC-S5-09: brandsCount reflects org1 brand count for tradies pack', async () => {
  const { body } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  const tradiesPack = body.find((p: any) => p.vertical === 'tradies' && p.region === 'au');
  expect(tradiesPack).toBeDefined();
  // Org1 has 1 tradies brand seeded in beforeAll
  expect(tradiesPack.brandsCount).toBeGreaterThanOrEqual(1);
});

// ─── TC-S5-10 — brandsCount is org-scoped (org2 has 0 brands) ────────────────

it('TC-S5-10: brandsCount for org2 is 0 (no brands seeded for org2)', async () => {
  const { body } = await getJson<any[]>('/api/vertical-packs', SESSION_2);
  const tradiesPack = body.find((p: any) => p.vertical === 'tradies' && p.region === 'au');
  expect(tradiesPack).toBeDefined();
  // Org2 has no brands — brandsCount should be 0.
  // Use Number() coercion before strict comparison: the API spec says brandsCount is a number,
  // but Postgres COUNT returns bigint which some drivers serialise as string.
  // TC-S5-05 already validates typeof === 'number'; this confirms the value itself.
  expect(Number(tradiesPack.brandsCount)).toBe(0);
});

// ─── TC-S5-11 — RLS: global table visible to both orgs ───────────────────────

it('TC-S5-11: vertical packs are global — both org1 and org2 see the same active packs', async () => {
  const { body: body1 } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  const { body: body2 } = await getJson<any[]>('/api/vertical-packs', SESSION_2);

  const ids1 = body1.filter((p: any) => p.region === 'au').map((p: any) => p.id).sort();
  const ids2 = body2.filter((p: any) => p.region === 'au').map((p: any) => p.id).sort();

  // Same pack IDs visible to both orgs — global data, no RLS restriction
  expect(ids1).toEqual(ids2);
});

// ─── TC-S5-12 — Deleted brand excluded from brandsCount ──────────────────────

it('TC-S5-12: soft-deleted brands are excluded from brandsCount', async () => {
  // Soft-delete org1's tradies brand temporarily
  await db.update(schema.brands)
    .set({ deletedAt: new Date() })
    .where(eq(schema.brands.id, org1BrandId));

  const { body } = await getJson<any[]>('/api/vertical-packs', SESSION_1);
  const tradiesPack = body.find((p: any) => p.vertical === 'tradies' && p.region === 'au');

  // Restore
  await db.update(schema.brands)
    .set({ deletedAt: null })
    .where(eq(schema.brands.id, org1BrandId));

  // Same coercion guard as TC-S5-10 — brandsCount must equal 0 after brand soft-delete
  expect(Number(tradiesPack?.brandsCount)).toBe(0);
});
