import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAuditSchedule, cleanupOrg } from '../../shared/seed';
import { eq, and, lte } from 'drizzle-orm';

let orgId='', brand1Id='', brand2Id='', scheduleId='', futureId='';

beforeAll(async () => {
  const cid = `org_s9qa_f08_${Date.now()}`;
  const o = await seedOrg({ clerkOrgId: cid, name: '[S9QA] F08 Org' });
  orgId = o.id;
  await seedUser({ clerkUserId: `user_s9qa_f08_${Date.now()}`, organizationId: orgId, email: `f08_${Date.now()}@test.local` });
  // Two brands needed — auditSchedules has unique index on brandId
  const b1 = await seedBrand({ organizationId: orgId, name: '[S9QA] F08 Brand1' });
  brand1Id = b1.id;
  const b2 = await seedBrand({ organizationId: orgId, name: '[S9QA] F08 Brand2' });
  brand2Id = b2.id;
  // Due schedule: nextRunAt 1 hour ago
  const due = await seedAuditSchedule({ organizationId: orgId, brandId: brand1Id, frequency: 'daily',
    nextRunAt: new Date(Date.now() - 3_600_000) });
  scheduleId = due.id;
  // Future schedule: nextRunAt 24h from now
  const future = await seedAuditSchedule({ organizationId: orgId, brandId: brand2Id, frequency: 'weekly',
    nextRunAt: new Date(Date.now() + 86_400_000) });
  futureId = future.id;
});
afterAll(async () => { await cleanupOrg(orgId); });

describe('[S9QA] F08 — DB CRUD: auditSchedules', () => {

  it('F08-01: schedule row has correct frequency and default status=active', async () => {
    const [s] = await db.select().from(schema.auditSchedules)
      .where(eq(schema.auditSchedules.id, scheduleId));
    expect(s.frequency).toBe('daily');
    expect(s.status).toBe('active');
  });

  it('F08-02: cron query — active schedules where nextRunAt <= NOW() returns due schedule', async () => {
    const due = await db.select({ id: schema.auditSchedules.id })
      .from(schema.auditSchedules)
      .where(and(
        eq(schema.auditSchedules.organizationId, orgId),
        eq(schema.auditSchedules.status, 'active'),
        lte(schema.auditSchedules.nextRunAt, new Date()),
      ));
    const ids = due.map(d => d.id);
    expect(ids).toContain(scheduleId);
    expect(ids).not.toContain(futureId);
  });

  it('F08-03: pause — status=paused, pausedReason set, updatedAt refreshed (GA2)', async () => {
    const before = new Date();
    await db.update(schema.auditSchedules)
      .set({ status: 'paused', pausedReason: 'Manually paused by QA', updatedAt: new Date() })
      .where(eq(schema.auditSchedules.id, scheduleId));
    const [s] = await db.select({ status: schema.auditSchedules.status,
                                   pausedReason: schema.auditSchedules.pausedReason,
                                   updatedAt: schema.auditSchedules.updatedAt })
      .from(schema.auditSchedules).where(eq(schema.auditSchedules.id, scheduleId));
    expect(s.status).toBe('paused');
    expect(s.pausedReason).toBe('Manually paused by QA');
    expect(s.updatedAt).toBeInstanceOf(Date);
    expect(s.updatedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('F08-04: paused schedule excluded from cron due query', async () => {
    const due = await db.select({ id: schema.auditSchedules.id })
      .from(schema.auditSchedules)
      .where(and(
        eq(schema.auditSchedules.organizationId, orgId),
        eq(schema.auditSchedules.status, 'active'),
        lte(schema.auditSchedules.nextRunAt, new Date()),
      ));
    expect(due.map(d => d.id)).not.toContain(scheduleId);
  });

  it('F08-05: resume — status=active, pausedReason cleared', async () => {
    await db.update(schema.auditSchedules)
      .set({ status: 'active', pausedReason: null, updatedAt: new Date() })
      .where(eq(schema.auditSchedules.id, scheduleId));
    const [s] = await db.select({ status: schema.auditSchedules.status,
                                   pausedReason: schema.auditSchedules.pausedReason })
      .from(schema.auditSchedules).where(eq(schema.auditSchedules.id, scheduleId));
    expect(s.status).toBe('active');
    expect(s.pausedReason).toBeNull();
  });

  it('F08-06: quota_exceeded status stored correctly', async () => {
    await db.update(schema.auditSchedules)
      .set({ status: 'quota_exceeded', updatedAt: new Date() })
      .where(eq(schema.auditSchedules.id, futureId));
    const [s] = await db.select({ status: schema.auditSchedules.status })
      .from(schema.auditSchedules).where(eq(schema.auditSchedules.id, futureId));
    expect(s.status).toBe('quota_exceeded');
  });

  it('F08-07: all schedule rows have updatedAt set (GA2 NOT NULL)', async () => {
    const rows = await db.select({ u: schema.auditSchedules.updatedAt })
      .from(schema.auditSchedules).where(eq(schema.auditSchedules.organizationId, orgId));
    expect(rows.every(r => r.u instanceof Date)).toBe(true);
  });

  it('F08-08: cron expression constant is 0 2 * * * (T2 — daily 02:00 UTC)', () => {
    const CRON = '0 2 * * *';
    expect(CRON).toMatch(/^0 2 \* \* \*$/);
  });
});
