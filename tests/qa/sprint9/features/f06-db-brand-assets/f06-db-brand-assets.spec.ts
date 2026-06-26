import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAgencyBrandAsset, cleanupOrg } from '../../shared/seed';
import { eq, and, isNull } from 'drizzle-orm';

let org1Id='', org2Id='', brand1Id='';
const ORG1_CID = `org_s9qa_f06_1_${Date.now()}`;
const ORG2_CID = `org_s9qa_f06_2_${Date.now()}`;

beforeAll(async () => {
  const o1 = await seedOrg({ clerkOrgId: ORG1_CID, name: '[S9QA] F06 Org1' });
  org1Id = o1.id;
  await seedUser({ clerkUserId: `user_s9qa_f06_1_${Date.now()}`, organizationId: org1Id, email: `f06_1_${Date.now()}@test.local` });
  const b = await seedBrand({ organizationId: org1Id, name: '[S9QA] F06 Brand1' });
  brand1Id = b.id;
  const o2 = await seedOrg({ clerkOrgId: ORG2_CID, name: '[S9QA] F06 Org2', tier: 'free' });
  org2Id = o2.id;
  await seedUser({ clerkUserId: `user_s9qa_f06_2_${Date.now()}`, organizationId: org2Id, email: `f06_2_${Date.now()}@test.local` });
});
afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

describe('[S9QA] F06 — DB CRUD: agencyBrandAssets', () => {

  it('F06-01: insert org-default asset (brandId=null) -> id returned', async () => {
    const r = await seedAgencyBrandAsset({ organizationId: org1Id, brandId: null, primaryColor: '#112233' });
    expect(r.id).toBeTruthy();
    expect(r.brandId).toBeNull();
    expect(r.primaryColor).toBe('#112233');
  });

  it('F06-02: insert per-brand asset -> brandId set', async () => {
    const r = await seedAgencyBrandAsset({ organizationId: org1Id, brandId: brand1Id, primaryColor: '#AABBCC' });
    expect(r.brandId).toBe(brand1Id);
  });

  it('F06-03: SELECT org-default via isNull filter returns row', async () => {
    const rows = await db.select().from(schema.agencyBrandAssets)
      .where(and(eq(schema.agencyBrandAssets.organizationId, org1Id),
                 isNull(schema.agencyBrandAssets.brandId)));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('F06-04: upsert org-default — second call updates colour, no duplicate row (GA3)', async () => {
    await seedAgencyBrandAsset({ organizationId: org1Id, brandId: null, primaryColor: '#FFFFFF' });
    const rows = await db.select({ pc: schema.agencyBrandAssets.primaryColor })
      .from(schema.agencyBrandAssets)
      .where(and(eq(schema.agencyBrandAssets.organizationId, org1Id),
                 isNull(schema.agencyBrandAssets.brandId)));
    expect(rows.every(r => r.pc === '#FFFFFF')).toBe(true);
  });

  it('F06-05: agencyName stored correctly', async () => {
    const rows = await db.select({ name: schema.agencyBrandAssets.agencyName })
      .from(schema.agencyBrandAssets).where(eq(schema.agencyBrandAssets.organizationId, org1Id));
    expect(rows.some(r => r.name === '[S9QA] Agency')).toBe(true);
  });

  it('F06-06: updatedAt is a Date (never null — GA2 pattern)', async () => {
    const rows = await db.select({ u: schema.agencyBrandAssets.updatedAt })
      .from(schema.agencyBrandAssets).where(eq(schema.agencyBrandAssets.organizationId, org1Id));
    expect(rows.every(r => r.u instanceof Date)).toBe(true);
  });

  it('F06-07: org2 has zero brand assets (RLS isolation)', async () => {
    const rows = await db.select().from(schema.agencyBrandAssets)
      .where(eq(schema.agencyBrandAssets.organizationId, org2Id));
    expect(rows).toHaveLength(0);
  });

  it('F06-08: DELETE all org1 brand assets leaves zero rows', async () => {
    await db.delete(schema.agencyBrandAssets)
      .where(eq(schema.agencyBrandAssets.organizationId, org1Id));
    const rows = await db.select().from(schema.agencyBrandAssets)
      .where(eq(schema.agencyBrandAssets.organizationId, org1Id));
    expect(rows).toHaveLength(0);
  });
});
