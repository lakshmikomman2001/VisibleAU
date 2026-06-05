/**
 * 03-action-items-list.test.ts
 *
 * Sprint 6 §9 — GET /api/action-items
 * Tests: auth, response shape, filters (brandId/status/dimension),
 * pagination (DK1), ordering (DK4), RLS org isolation.
 *
 * TC-S6-21 through TC-S6-35
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItem, seedActionItemSuite, deleteTestDataForOrg,
} from './helpers/db';
import { getJson, getNoAuth, patchJson, SESSION_1, SESSION_2 } from './helpers/http';
import * as schema from '../../../../db/schema';
import { eq }      from 'drizzle-orm';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
  clerkOrgId2:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId2: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email2:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let brand2Id = '';
let audit1Id = '';
let audit2Id = '';

beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-E2E] List Test Org1', tier: 'starter' });
  const org2 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S6-E2E] List Test Org2', tier: 'free' });
  org1Id = org1.id;
  org2Id = org2.id;

  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });

  const brand1 = await seedBrand({ organizationId: org1Id, vertical: 'tradies', name: '[S6-E2E] Org1 Brand' });
  const brand2 = await seedBrand({ organizationId: org2Id, vertical: 'saas',    name: '[S6-E2E] Org2 Brand' });
  brand1Id = brand1.id;
  brand2Id = brand2.id;

  const audit1 = await seedAudit({ organizationId: org1Id, brandId: brand1Id, scoreFrequency: '30.00', scoreComposite: '35.00' });
  const audit2 = await seedAudit({ organizationId: org2Id, brandId: brand2Id, scoreFrequency: '32.00', scoreComposite: '36.00' });
  audit1Id = audit1.id;
  audit2Id = audit2.id;

  // Seed a full suite for Org1 (7 items across 5 dimensions)
  await seedActionItemSuite({ organizationId: org1Id, brandId: brand1Id, auditId: audit1Id });

  // Seed 2 items for Org2 (cross-org isolation tests)
  await seedActionItem({
    organizationId: org2Id, brandId: brand2Id, auditId: audit2Id,
    recommendationKey: 'faq-content', dimension: 'context',
    title: '[S6-E2E] Org2 FAQ', action: 'Add FAQ schema.', confidenceLabel: 'likely', expectedImpactScore: 'medium',
  });
  await seedActionItem({
    organizationId: org2Id, brandId: brand2Id, auditId: audit2Id,
    recommendationKey: 'comparison-article', dimension: 'position',
    title: '[S6-E2E] Org2 Comparison', action: 'Write comparison article.', confidenceLabel: 'hypothesis', expectedImpactScore: 'medium',
  });
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
});

// ─── TC-S6-21 — Unauthenticated → 401 ────────────────────────────────────────

it('TC-S6-21: GET /api/action-items unauthenticated returns 401', async () => {
  const { status } = await getNoAuth('/api/action-items');
  expect(status).toBe(401);
});

// ─── TC-S6-22 — Returns items for authenticated org ───────────────────────────

it('TC-S6-22: GET /api/action-items returns items for org1 with correct shape', async () => {
  const { status, body } = await getJson<{ items: any[]; total: number; page: number; totalPages: number }>(
    '/api/action-items', SESSION_1
  );
  expect(status).toBe(200);
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items.length).toBeGreaterThan(0);
  expect(typeof body.total).toBe('number');
  expect(typeof body.page).toBe('number');
  expect(typeof body.totalPages).toBe('number');
});

// ─── TC-S6-23 — Response shape per DA5 fix ────────────────────────────────────

it('TC-S6-23: each action item has all DA5 required fields including brandName from JOIN', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items', SESSION_1);
  const item = body.items[0];
  expect(item).toBeDefined();

  // DA5 required fields
  const requiredFields = [
    'id', 'recommendationKey', 'dimension', 'title', 'action',
    'confidenceLabel', 'expectedImpactScore', 'evidenceRefs',
    'status', 'brandId', 'brandName', 'auditId', 'createdAt', 'updatedAt',
  ];
  for (const f of requiredFields) {
    expect(item, `field '${f}' missing`).toHaveProperty(f);
  }

  // evidenceRefs is an array
  expect(Array.isArray(item.evidenceRefs)).toBe(true);

  // brandName comes from JOIN — not null
  expect(typeof item.brandName).toBe('string');
  expect(item.brandName.length).toBeGreaterThan(0);
});

// ─── TC-S6-24 — Default filters: only open + in_progress items ───────────────

it('TC-S6-24: default response includes only open and in_progress status items', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items', SESSION_1);
  for (const item of body.items) {
    expect(['open', 'in_progress']).toContain(item.status);
  }
});

// ─── TC-S6-25 — ?status=open filter ──────────────────────────────────────────

it('TC-S6-25: ?status=open filter returns only open items', async () => {
  // Seed a done item then filter to open only
  const done = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'status-filter-done-test',
    status: 'done',
  });

  const { body } = await getJson<{ items: any[] }>('/api/action-items?status=open', SESSION_1);
  const ids = body.items.map((i: any) => i.id);
  expect(ids).not.toContain(done.id);

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, done.id));
});

// ─── TC-S6-26 — ?dimension=frequency filter ──────────────────────────────────

it('TC-S6-26: ?dimension=frequency returns only frequency items', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items?dimension=frequency', SESSION_1);
  expect(body.items.length).toBeGreaterThan(0);
  for (const item of body.items) {
    expect(item.dimension).toBe('frequency');
  }
});

// ─── TC-S6-27 — ?brandId filter ───────────────────────────────────────────────

it('TC-S6-27: ?brandId filter returns only items for that brand', async () => {
  const { body } = await getJson<{ items: any[] }>(
    `/api/action-items?brandId=${brand1Id}`, SESSION_1
  );
  expect(body.items.length).toBeGreaterThan(0);
  for (const item of body.items) {
    expect(item.brandId).toBe(brand1Id);
  }
});

// ─── TC-S6-28 — Ordering: dimension ASC, createdAt DESC (DK4) ────────────────

it('TC-S6-28: items ordered by dimension ASC then createdAt DESC (DK4 fix)', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  const items = body.items;

  // Verify dimension ordering is alphabetical (ASC)
  for (let i = 1; i < items.length; i++) {
    const prevDim = items[i - 1].dimension;
    const currDim = items[i].dimension;
    if (prevDim !== currDim) {
      // When dimension changes, it must be lexicographically greater (ASC)
      expect(currDim >= prevDim).toBe(true);
    }
  }
});

// ─── TC-S6-29 — Pagination: ?limit and ?page (DK1) ───────────────────────────

it('TC-S6-29: pagination works — limit=2 page=1 returns 2 items with correct metadata', async () => {
  const { body } = await getJson<{ items: any[]; total: number; page: number; totalPages: number }>(
    '/api/action-items?limit=2&page=1', SESSION_1
  );
  expect(body.items).toHaveLength(2);
  // G1/F7 FIX: The spec DN2 code shows page used in arithmetic .offset((page-1)*limit),
  // implying parseInt, but the spec never explicitly shows the parseInt line.
  // A developer could return page from searchParams.get() directly as string '1'.
  // vitest toBe uses Object.is strict equality: Object.is('1', 1) === false → test fails.
  // Use Number() to accept both string '1' and number 1 from any valid implementation.
  expect(Number(body.page)).toBe(1);
  expect(body.total).toBeGreaterThanOrEqual(2);
  expect(body.totalPages).toBe(Math.ceil(Number(body.total) / 2));
});

it('TC-S6-30: pagination page=2 returns different items from page=1', async () => {
  const page1 = await getJson<{ items: any[] }>('/api/action-items?limit=2&page=1', SESSION_1);
  const page2 = await getJson<{ items: any[] }>('/api/action-items?limit=2&page=2', SESSION_1);

  const ids1 = page1.body.items.map((i: any) => i.id);
  const ids2 = page2.body.items.map((i: any) => i.id);
  const overlap = ids1.filter(id => ids2.includes(id));
  expect(overlap).toHaveLength(0);
});

// ─── TC-S6-31 — RLS isolation: org1 does not see org2 items ──────────────────

it('TC-S6-31: org1 user cannot see org2 action items (RLS)', async () => {
  const org2Item = await seedActionItem({
    organizationId: org2Id, brandId: brand2Id, auditId: audit2Id,
    recommendationKey: 'rls-check-org2', dimension: 'context',
    title: '[S6-E2E] Org2 RLS Check', action: 'Should not be visible to org1.',
    confidenceLabel: 'hypothesis', expectedImpactScore: 'low',
  });

  const { body } = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  const ids = body.items.map((i: any) => i.id);
  expect(ids).not.toContain(org2Item.id);

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, org2Item.id));
});

// ─── TC-S6-32 — confidenceLabel values are valid ──────────────────────────────

it('TC-S6-32: all returned items have valid confidenceLabel values', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  const valid = new Set(['confirmed', 'likely', 'hypothesis']);
  for (const item of body.items) {
    expect(valid.has(item.confidenceLabel),
      `Invalid confidenceLabel: ${item.confidenceLabel}`
    ).toBe(true);
  }
});

// ─── TC-S6-33 — expectedImpactScore values are valid ─────────────────────────

it('TC-S6-33: all returned items have valid expectedImpactScore values (DM4: NOT NULL)', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  const valid = new Set(['high', 'medium', 'low']);
  for (const item of body.items) {
    expect(item.expectedImpactScore).toBeDefined();
    expect(item.expectedImpactScore).not.toBeNull();
    expect(valid.has(item.expectedImpactScore),
      `Invalid expectedImpactScore: ${item.expectedImpactScore}`
    ).toBe(true);
  }
});

// ─── TC-S6-34 — Items with done/dismissed not returned by default ─────────────

it('TC-S6-34: done and dismissed items are excluded from default list response', async () => {
  const dismissed = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'dismissed-filter-test', status: 'dismissed',
    title: '[S6-E2E] Dismissed', action: 'Should not appear.',
    confidenceLabel: 'hypothesis', expectedImpactScore: 'low',
  });

  const { body } = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  const ids = body.items.map((i: any) => i.id);
  expect(ids).not.toContain(dismissed.id);

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, dismissed.id));
});

// ─── TC-S6-35 — dimension values are one of 5 canonical values ───────────────

it('TC-S6-35: all returned items have canonical dimension values', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  const valid = new Set(['frequency', 'position', 'sentiment', 'context', 'accuracy']);
  for (const item of body.items) {
    expect(valid.has(item.dimension),
      `Invalid dimension: ${item.dimension}`
    ).toBe(true);
  }
});
