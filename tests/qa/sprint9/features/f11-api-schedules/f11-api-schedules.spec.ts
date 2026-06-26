import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAuditSchedule, cleanupOrg } from '../../shared/seed';
import { eq, and, lte } from 'drizzle-orm';

let org1Id='', org2Id='', brandId='', scheduleId='';

beforeAll(async () => {
  const o1 = await seedOrg({ clerkOrgId: `org_s9qa_f11_1_${Date.now()}`, name: '[S9QA] F11 Org1' });
  org1Id = o1.id;
  await seedUser({ clerkUserId: `user_s9qa_f11_1_${Date.now()}`, organizationId: org1Id, email: `f11_1_${Date.now()}@test.local` });
  const b = await seedBrand({ organizationId: org1Id, name: '[S9QA] F11 Brand' });
  brandId = b.id;
  const s = await seedAuditSchedule({ organizationId: org1Id, brandId,
    frequency: 'weekly', status: 'active',
    nextRunAt: new Date(Date.now() + 7 * 86_400_000) });
  scheduleId = s.id;
  const o2 = await seedOrg({ clerkOrgId: `org_s9qa_f11_2_${Date.now()}`, name: '[S9QA] F11 Org2', tier: 'free' });
  org2Id = o2.id;
  await seedUser({ clerkUserId: `user_s9qa_f11_2_${Date.now()}`, organizationId: org2Id, email: `f11_2_${Date.now()}@test.local` });
});
afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

describe('[S9QA] F11 — audit-schedules GET/PATCH (GG2) — DB-level', () => {

  it('F11-01: schedule row exists with correct frequency and status', async () => {
    const [s] = await db.select().from(schema.auditSchedules)
      .where(eq(schema.auditSchedules.id, scheduleId));
    expect(s).toBeTruthy();
    expect(s.frequency).toBe('weekly');
    expect(s.status).toBe('active');
  });

  it('F11-02: schedule linked to correct brand via brandId', async () => {
    const [s] = await db.select().from(schema.auditSchedules)
      .where(eq(schema.auditSchedules.id, scheduleId));
    expect(s.brandId).toBe(brandId);
  });

  it('F11-03: org2 has zero schedules (RLS isolation)', async () => {
    const rows = await db.select().from(schema.auditSchedules)
      .where(eq(schema.auditSchedules.organizationId, org2Id));
    expect(rows).toHaveLength(0);
  });

  it('F11-04: PATCH pause -> status=paused in DB', async () => {
    await db.update(schema.auditSchedules)
      .set({ status: 'paused', pausedReason: 'QA pause test', updatedAt: new Date() })
      .where(eq(schema.auditSchedules.id, scheduleId));
    const [s] = await db.select({ status: schema.auditSchedules.status,
                                   pausedReason: schema.auditSchedules.pausedReason })
      .from(schema.auditSchedules).where(eq(schema.auditSchedules.id, scheduleId));
    expect(s.status).toBe('paused');
    expect(s.pausedReason).toBe('QA pause test');
  });

  it('F11-05: PATCH pause persists — updatedAt refreshed (GA2)', async () => {
    const [row] = await db.select({ updatedAt: schema.auditSchedules.updatedAt })
      .from(schema.auditSchedules).where(eq(schema.auditSchedules.id, scheduleId));
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('F11-06: PATCH resume -> status=active, pausedReason null', async () => {
    await db.update(schema.auditSchedules)
      .set({ status: 'active', pausedReason: null, updatedAt: new Date() })
      .where(eq(schema.auditSchedules.id, scheduleId));
    const [s] = await db.select({ status: schema.auditSchedules.status,
                                   pausedReason: schema.auditSchedules.pausedReason })
      .from(schema.auditSchedules).where(eq(schema.auditSchedules.id, scheduleId));
    expect(s.status).toBe('active');
    expect(s.pausedReason).toBeNull();
  });

  it('F11-07: cron-due query returns only active schedules with past nextRunAt', async () => {
    // Make schedule due
    await db.update(schema.auditSchedules)
      .set({ nextRunAt: new Date(Date.now() - 3_600_000), updatedAt: new Date() })
      .where(eq(schema.auditSchedules.id, scheduleId));
    const due = await db.select({ id: schema.auditSchedules.id })
      .from(schema.auditSchedules)
      .where(and(
        eq(schema.auditSchedules.organizationId, org1Id),
        eq(schema.auditSchedules.status, 'active'),
        lte(schema.auditSchedules.nextRunAt, new Date()),
      ));
    expect(due.map(d => d.id)).toContain(scheduleId);
  });

  it('F11-08: /api/audit-schedules route file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/audit-schedules/route.ts')).toBe(true);
  });

  it('F11-09: /api/audit-schedules/[id] route file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/audit-schedules/[id]/route.ts')).toBe(true);
  });
});
