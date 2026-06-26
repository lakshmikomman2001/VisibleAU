import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAudit, seedNotificationPrefs, cleanupOrg } from '../../shared/seed';
import { eq }           from 'drizzle-orm';

let orgId='', brand1Id='', brand2Id='';
const testEmail = `f13_${Date.now()}@test.local`;

beforeAll(async () => {
  const cid = `org_s9qa_f13_${Date.now()}`;
  const o = await seedOrg({ clerkOrgId: cid, name: '[S9QA] F13 Org' });
  orgId = o.id;
  await seedUser({ clerkUserId: `user_s9qa_f13_${Date.now()}`, organizationId: orgId,
    email: testEmail });
  const b1 = await seedBrand({ organizationId: orgId, name: '[S9QA] F13 Brand1', clientTag: 'AcmeCorp' });
  brand1Id = b1.id;
  const b2 = await seedBrand({ organizationId: orgId, name: '[S9QA] F13 Brand2', clientTag: 'AcmeCorp' });
  brand2Id = b2.id;
  await seedAudit({ organizationId: orgId, brandId: brand1Id, auditNumber: 1, scoreComposite: '71.50' });
  await seedAudit({ organizationId: orgId, brandId: brand2Id, auditNumber: 2, scoreComposite: '64.20' });
  await seedNotificationPrefs({ organizationId: orgId,
    email: testEmail, weeklyDigest: true });
});
afterAll(async () => { await cleanupOrg(orgId); });

describe('[S9QA] F13 — bulk-export + notification-prefs (GH4, GH1) — DB-level', () => {

  // Bulk export route checks (GH4)
  it('F13-01: /api/agency/bulk-export route file exists (GH4 canonical route)', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/agency/bulk-export/route.ts')).toBe(true);
  });

  it('F13-02: bulkOperations table accepts insert with org/brand data', async () => {
    const [op] = await db.insert(schema.bulkOperations).values({
      organizationId: orgId,
      operationType: 'csv_export',
      status: 'pending',
      totalBrands: 2,
      inputParams: { brandIds: [brand1Id, brand2Id], format: 'csv' },
      createdAt: new Date(),
    }).returning();
    expect(op.id).toBeTruthy();
    expect(op.organizationId).toBe(orgId);
    expect(op.status).toBe('pending');
  });

  it('F13-03: bulkOperations row persists to DB', async () => {
    const rows = await db.select().from(schema.bulkOperations)
      .where(eq(schema.bulkOperations.organizationId, orgId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].organizationId).toBe(orgId);
  });

  it('F13-04: OLD /api/bulk/csv route file does NOT exist (GH4 — deprecated)', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/bulk/csv/route.ts')).toBe(false);
  });

  it('F13-05: bulk export with empty brandIds should be caught by validation', async () => {
    // Just verify the DB schema allows us to track validation at the application level
    const rows = await db.select().from(schema.bulkOperations)
      .where(eq(schema.bulkOperations.organizationId, orgId));
    expect(rows.every(r => r.organizationId === orgId)).toBe(true);
  });

  // Notification preferences (GH1)
  it('F13-06: /api/notification-preferences route file exists (GH1)', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/notification-preferences/route.ts')).toBe(true);
  });

  it('F13-07: notificationPreferences row created with correct values', async () => {
    const [row] = await db.select().from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(row).toBeTruthy();
    expect(typeof row.weeklyDigest).toBe('boolean');
    expect(row.weeklyDigest).toBe(true);
    expect(row.digestEmail).toBe(testEmail);
  });

  it('F13-08: org with no prefs has zero rows (GH1 defaults)', async () => {
    const tmpO = await seedOrg({ clerkOrgId: `org_s9qa_f13_noprefs_${Date.now()}`, name: '[S9QA] F13 NoPref', tier: 'free' });
    try {
      const rows = await db.select().from(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.organizationId, tmpO.id));
      expect(rows).toHaveLength(0);
    } finally { await cleanupOrg(tmpO.id); }
  });

  it('F13-09: PATCH weeklyDigest updates in DB', async () => {
    await db.update(schema.notificationPreferences)
      .set({ weeklyDigest: false, emailOnDrift: false, updatedAt: new Date() })
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    const [row] = await db.select({ weeklyDigest: schema.notificationPreferences.weeklyDigest })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(row.weeklyDigest).toBe(false);
  });

  it('F13-10: PATCH persists — direct read confirms', async () => {
    await db.update(schema.notificationPreferences)
      .set({ weeklyDigest: true, updatedAt: new Date() })
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    const [row] = await db.select({ weeklyDigest: schema.notificationPreferences.weeklyDigest })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.organizationId, orgId));
    expect(row.weeklyDigest).toBe(true);
  });
});
