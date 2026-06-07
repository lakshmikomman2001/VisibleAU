/**
 * 05-action-items-status.test.ts
 *
 * Sprint 6 §9 — PATCH /api/action-items/[id]/status  (DB3 + DJ1 fixes)
 * Tests: mark done, mark dismissed (with reason), in_progress, validation,
 * timestamp fields set, updatedAt updated, idempotency, cross-org 404.
 *
 * TC-S6-43 through TC-S6-54
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItem, deleteTestDataForOrg,
} from './helpers/db';
import { patchJson, patchNoAuth, getJson, SESSION_1, SESSION_2 } from './helpers/http';
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

let org1Id    = '';
let org2Id    = '';
let brand1Id  = '';
let brand2Id  = '';
let audit1Id  = '';
let audit2Id  = '';

beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-E2E] Status Org1', tier: 'starter' });
  const org2 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S6-E2E] Status Org2', tier: 'free' });
  org1Id = org1.id;
  org2Id = org2.id;

  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });

  const brand1 = await seedBrand({ organizationId: org1Id, name: '[S6-E2E] Status Brand1' });
  const brand2 = await seedBrand({ organizationId: org2Id, name: '[S6-E2E] Status Brand2', vertical: 'saas' });
  brand1Id = brand1.id;
  brand2Id = brand2.id;

  const audit1 = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  const audit2 = await seedAudit({ organizationId: org2Id, brandId: brand2Id });
  audit1Id = audit1.id;
  audit2Id = audit2.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
});

// ─── TC-S6-43 — Unauthenticated → 401 ────────────────────────────────────────

it('TC-S6-43: PATCH /api/action-items/[id]/status unauthenticated returns 401', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'auth-test-patch',
  });
  try {
    const { status } = await patchNoAuth(
      `/api/action-items/${item.id}/status`, { status: 'done' }
    );
    expect(status).toBe(401);
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});

// ─── TC-S6-44 — Mark done: sets doneAt and status ────────────────────────────

it('TC-S6-44: PATCH status=done sets status=done and doneAt timestamp', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'mark-done-test',
  });

  const before = new Date();
  const { status, body } = await patchJson<{ id: string; status: string }>(
    `/api/action-items/${item.id}/status`, SESSION_1, { status: 'done' }
  );
  expect(status).toBe(200);
  expect(body.status).toBe('done');

  // Verify DB state
  const [row] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  expect(row.status).toBe('done');
  expect(row.doneAt).not.toBeNull();
  expect(new Date(row.doneAt!).getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(row.updatedAt).not.toBeNull();

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── TC-S6-45 — Mark dismissed: requires dismissedReason (DB3 Zod refine) ───

it('TC-S6-45: PATCH status=dismissed without dismissedReason returns 400 (DB3 Zod refine)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'dismiss-no-reason-test',
  });
  try {
    const { status } = await patchJson(
      `/api/action-items/${item.id}/status`, SESSION_1,
      { status: 'dismissed' }  // no dismissedReason
    );
    expect(status).toBe(400);
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});

// ─── TC-S6-46 — Mark dismissed with reason: sets all fields ──────────────────

it('TC-S6-46: PATCH status=dismissed with reason sets dismissedAt, dismissedReason, updatedAt', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'mark-dismissed-test',
  });

  const reason = 'Already addressed this via our PR agency';
  const before = new Date();
  const { status, body } = await patchJson<{ id: string; status: string }>(
    `/api/action-items/${item.id}/status`, SESSION_1,
    { status: 'dismissed', dismissedReason: reason }
  );
  expect(status).toBe(200);
  expect(body.status).toBe('dismissed');

  const [row] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  expect(row.status).toBe('dismissed');
  expect(row.dismissedReason).toBe(reason);
  expect(row.dismissedAt).not.toBeNull();
  expect(new Date(row.dismissedAt!).getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(row.updatedAt).not.toBeNull();

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── TC-S6-47 — Mark in_progress: clears doneAt and dismissedAt ──────────────

it('TC-S6-47: PATCH status=in_progress clears doneAt and dismissedAt (DJ1 fix)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'in-progress-clear-test', status: 'done',
  });

  // First mark as done (sets doneAt)
  await patchJson(`/api/action-items/${item.id}/status`, SESSION_1, { status: 'done' });

  // Now revert to in_progress — doneAt should be cleared
  const { status, body } = await patchJson<{ id: string; status: string }>(
    `/api/action-items/${item.id}/status`, SESSION_1, { status: 'in_progress' }
  );
  expect(status).toBe(200);
  expect(body.status).toBe('in_progress');

  const [row] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  expect(row.status).toBe('in_progress');
  expect(row.doneAt).toBeNull();
  expect(row.dismissedAt).toBeNull();

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── TC-S6-48 — updatedAt always updated on PATCH ────────────────────────────

it('TC-S6-48: updatedAt is updated on every PATCH status change (DA2 fix)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'updated-at-test',
  });

  const [before] = await db.select({ updatedAt: schema.actionItems.updatedAt })
    .from(schema.actionItems).where(eq(schema.actionItems.id, item.id));

  // Small delay to ensure timestamp difference
  await new Promise(r => setTimeout(r, 100));

  await patchJson(`/api/action-items/${item.id}/status`, SESSION_1, { status: 'in_progress' });

  const [after] = await db.select({ updatedAt: schema.actionItems.updatedAt })
    .from(schema.actionItems).where(eq(schema.actionItems.id, item.id));

  expect(new Date(after.updatedAt!).getTime())
    .toBeGreaterThan(new Date(before.updatedAt!).getTime());

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── TC-S6-49 — Invalid status value → 400 (DB3 Zod enum) ───────────────────

it('TC-S6-49: PATCH with invalid status value returns 400 (DB3 Zod enum validation)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'invalid-status-test',
  });
  try {
    const { status } = await patchJson(
      `/api/action-items/${item.id}/status`, SESSION_1,
      { status: 'deleted' }  // not in enum: in_progress | done | dismissed
    );
    expect(status).toBe(400);
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});

// ─── TC-S6-50 — status='open' is not a valid PATCH target ────────────────────

it('TC-S6-50: PATCH with status=open returns 400 (open is default, cannot be set via PATCH)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'open-status-patch-test',
  });
  try {
    const { status } = await patchJson(
      `/api/action-items/${item.id}/status`, SESSION_1,
      { status: 'open' }  // not in PATCH enum (only in_progress|done|dismissed allowed)
    );
    expect(status).toBe(400);
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});

// ─── TC-S6-51 — 404 for non-existent UUID ────────────────────────────────────

it('TC-S6-51: PATCH status for non-existent UUID returns 404', async () => {
  const { status } = await patchJson(
    '/api/action-items/00000000-0000-0000-0000-000000000000/status',
    SESSION_1, { status: 'done' }
  );
  expect(status).toBe(404);
});

// ─── TC-S6-52 — Cross-org PATCH → 404 (DM5: setRlsContext on PATCH) ──────────

it('TC-S6-52: PATCH cross-org item returns 404 (RLS — DM5 fix: setRlsContext on PATCH)', async () => {
  // Create item in org1
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'cross-org-patch-test',
  });

  // Org2 tries to PATCH org1's item
  const { status } = await patchJson(
    `/api/action-items/${item.id}/status`, SESSION_2, { status: 'done' }
  );
  expect(status).toBe(404);

  // Verify item unchanged in DB (org1 can still read it)
  const [row] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  expect(row.status).toBe('open');

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── TC-S6-53 — Response body has id and status ──────────────────────────────

it('TC-S6-53: PATCH response body contains id and status (DJ1 returning clause)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'response-body-test',
  });

  const { body } = await patchJson<{ id: string; status: string }>(
    `/api/action-items/${item.id}/status`, SESSION_1, { status: 'in_progress' }
  );

  expect(body.id).toBe(item.id);
  expect(body.status).toBe('in_progress');

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── TC-S6-54 — dismissedReason max 500 chars (DB3 Zod max) ──────────────────

it('TC-S6-54: PATCH dismissedReason longer than 500 chars returns 400 (DB3 Zod max)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'reason-max-length-test',
  });
  try {
    const longReason = 'A'.repeat(501);
    const { status } = await patchJson(
      `/api/action-items/${item.id}/status`, SESSION_1,
      { status: 'dismissed', dismissedReason: longReason }
    );
    expect(status).toBe(400);
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});
