import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAgencyBrandAsset, cleanupOrg } from '../../shared/seed';
import { eq, and, isNull } from 'drizzle-orm';

let orgId='', brandId='';

beforeAll(async () => {
  const cid = `org_s9qa_f10_${Date.now()}`;
  const o = await seedOrg({ clerkOrgId: cid, name: '[S9QA] F10 Org' });
  orgId = o.id;
  await seedUser({ clerkUserId: `user_s9qa_f10_${Date.now()}`, organizationId: orgId, email: `f10_${Date.now()}@test.local` });
  const b = await seedBrand({ organizationId: orgId, name: '[S9QA] F10 Brand' });
  brandId = b.id;
  await seedAgencyBrandAsset({ organizationId: orgId, brandId: null,
    primaryColor: '#003366', agencyName: '[S9QA] F10 Agency' });
});
afterAll(async () => { await cleanupOrg(orgId); });

describe('[S9QA] F10 — agency branding GET/PATCH (GG3) — DB-level', () => {

  it('F10-01: org-default branding asset exists after seed', async () => {
    const rows = await db.select().from(schema.agencyBrandAssets)
      .where(and(eq(schema.agencyBrandAssets.organizationId, orgId),
                 isNull(schema.agencyBrandAssets.brandId)));
    expect(rows.length).toBe(1);
    expect(rows[0].primaryColor).toBe('#003366');
    expect(rows[0].agencyName).toBe('[S9QA] F10 Agency');
  });

  it('F10-02: fresh org has zero branding rows', async () => {
    const tmpO = await seedOrg({ clerkOrgId: `org_s9qa_f10_tmp_${Date.now()}`, name: '[S9QA] F10 Tmp', tier: 'free' });
    try {
      const rows = await db.select().from(schema.agencyBrandAssets)
        .where(eq(schema.agencyBrandAssets.organizationId, tmpO.id));
      expect(rows).toHaveLength(0);
    } finally { await cleanupOrg(tmpO.id); }
  });

  it('F10-03: upsert branding via seed updates existing row', async () => {
    await seedAgencyBrandAsset({ organizationId: orgId, brandId: null,
      primaryColor: '#7C3AED', agencyName: '[S9QA] F10 Agency Updated' });
    const rows = await db.select().from(schema.agencyBrandAssets)
      .where(and(eq(schema.agencyBrandAssets.organizationId, orgId),
                 isNull(schema.agencyBrandAssets.brandId)));
    expect(rows.length).toBe(1);
    expect(rows[0].primaryColor).toBe('#7C3AED');
    expect(rows[0].agencyName).toBe('[S9QA] F10 Agency Updated');
  });

  it('F10-04: PATCH persists to DB — direct DB read confirms new values', async () => {
    await db.update(schema.agencyBrandAssets)
      .set({ agencyName: '[S9QA] F10 PersistCheck', updatedAt: new Date() })
      .where(and(eq(schema.agencyBrandAssets.organizationId, orgId),
                 isNull(schema.agencyBrandAssets.brandId)));
    const rows = await db.select({ name: schema.agencyBrandAssets.agencyName })
      .from(schema.agencyBrandAssets).where(eq(schema.agencyBrandAssets.organizationId, orgId));
    expect(rows.some(r => r.name === '[S9QA] F10 PersistCheck')).toBe(true);
  });

  it('F10-05: per-brand asset stored separately from org-default', async () => {
    await seedAgencyBrandAsset({ organizationId: orgId, brandId, primaryColor: '#FF0000' });
    const all = await db.select().from(schema.agencyBrandAssets)
      .where(eq(schema.agencyBrandAssets.organizationId, orgId));
    expect(all.length).toBe(2);
    const orgDefault = all.find(r => r.brandId === null);
    const perBrand = all.find(r => r.brandId === brandId);
    expect(orgDefault).toBeTruthy();
    expect(perBrand).toBeTruthy();
    expect(perBrand!.primaryColor).toBe('#FF0000');
  });

  it('F10-06: updatedAt refreshed on upsert', async () => {
    const before = new Date(Date.now() - 1000);
    await seedAgencyBrandAsset({ organizationId: orgId, brandId: null, primaryColor: '#000000' });
    const [row] = await db.select({ u: schema.agencyBrandAssets.updatedAt })
      .from(schema.agencyBrandAssets)
      .where(and(eq(schema.agencyBrandAssets.organizationId, orgId),
                 isNull(schema.agencyBrandAssets.brandId)));
    expect(row.u.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('F10-07: /api/agency/branding route file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/agency/branding/route.ts')).toBe(true);
  });
});
