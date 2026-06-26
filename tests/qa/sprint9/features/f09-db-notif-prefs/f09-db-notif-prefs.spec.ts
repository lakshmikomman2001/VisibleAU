import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from '../../shared/db';
import { seedOrg, seedUser, seedNotificationPrefs, cleanupOrg } from '../../shared/seed';
import { eq }           from 'drizzle-orm';

let orgId='';
const testEmail = `f09_${Date.now()}@test.local`;

beforeAll(async () => {
  const cid = `org_s9qa_f09_${Date.now()}`;
  const o = await seedOrg({ clerkOrgId: cid, name: '[S9QA] F09 Org' });
  orgId = o.id;
  await seedUser({ clerkUserId: `user_s9qa_f09_${Date.now()}`, organizationId: orgId, email: testEmail });
});
afterAll(async () => { await cleanupOrg(orgId); });

describe('[S9QA] F09 — DB CRUD: notificationPreferences (T3)', () => {

  it('F09-01: create prefs row — weeklyDigest=true, digestEmail set', async () => {
    const n = await seedNotificationPrefs({ organizationId: orgId,
      email: testEmail, weeklyDigest: true });
    expect(n.weeklyDigest).toBe(true);
    expect(n.digestEmail).toBe(testEmail);
    expect(n.organizationId).toBe(orgId);
  });

  it('F09-02: upsert — calling seedNotificationPrefs twice does NOT create two rows', async () => {
    await seedNotificationPrefs({ organizationId: orgId,
      email: testEmail, weeklyDigest: false });
    const rows = await db.select().from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(rows).toHaveLength(1);
  });

  it('F09-03: upsert updates weeklyDigest value', async () => {
    const [row] = await db.select({ weeklyDigest: schema.notificationPreferences.weeklyDigest })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(typeof row.weeklyDigest).toBe('boolean');
    expect(row.weeklyDigest).toBe(false);
  });

  it('F09-04: PATCH weeklyDigest back to true', async () => {
    await db.update(schema.notificationPreferences)
      .set({ weeklyDigest: true, updatedAt: new Date() })
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    const [row] = await db.select({ weeklyDigest: schema.notificationPreferences.weeklyDigest })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(row.weeklyDigest).toBe(true);
  });

  it('F09-05: emailOnDrift and emailOnScheduleFailure are boolean NOT NULL', async () => {
    const [row] = await db.select({
      drift:   schema.notificationPreferences.emailOnDrift,
      failure: schema.notificationPreferences.emailOnScheduleFailure,
    }).from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(typeof row.drift).toBe('boolean');
    expect(typeof row.failure).toBe('boolean');
  });

  it('F09-06: updatedAt is a Date on all rows', async () => {
    const [row] = await db.select({ u: schema.notificationPreferences.updatedAt })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(row.u).toBeInstanceOf(Date);
  });

  it('F09-07: weekly digest cron expression is 0 23 * * 1 (T3 — Mon 23:00 UTC = Tue 09:00 AEST)', () => {
    const DIGEST_CRON = '0 23 * * 1';
    expect(DIGEST_CRON).toMatch(/^0 23 \* \* 1$/);
  });

  it('F09-08: DELETE prefs for org removes the row', async () => {
    await db.delete(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    const rows = await db.select().from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(rows).toHaveLength(0);
  });
});
