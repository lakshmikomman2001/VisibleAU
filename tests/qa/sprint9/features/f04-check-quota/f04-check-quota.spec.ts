import { describe, it, expect, afterAll } from 'vitest';
import { db, schema }  from '../../shared/db';
import { seedOrg, seedBrand, seedAudit, cleanupOrg } from '../../shared/seed';
import { checkQuota }  from '@/lib/scheduling/quota-check';
import { like }        from 'drizzle-orm';

afterAll(async () => {
  const stale = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(like(schema.organizations.clerkOrgId, 'org_s9qa_f04_%'));
  for (const o of stale) await cleanupOrg(o.id);
});

async function fixture(tier: string) {
  const suffix = `${tier}_${Date.now()}`;
  const o = await seedOrg({ clerkOrgId: `org_s9qa_f04_${suffix}`, name: `[S9QA] F04 ${tier}`, tier });
  const b = await seedBrand({ organizationId: o.id });
  return { orgId: o.id, brandId: b.id, cleanup: () => cleanupOrg(o.id) };
}

describe('[S9QA] F04 — checkQuota — monthly cap enforcement (T1)', () => {

  it('F04-01: free org 0 audits -> allowed (true)', async () => {
    const { orgId, brandId, cleanup } = await fixture('free');
    try { expect(await checkQuota(orgId, brandId)).toBe(true); }
    finally { await cleanup(); }
  });

  it('F04-02: free org 1 audit this month -> blocked (limit = 1)', async () => {
    const { orgId, brandId, cleanup } = await fixture('free');
    try {
      await seedAudit({ organizationId: orgId, brandId });
      expect(await checkQuota(orgId, brandId)).toBe(false);
    } finally { await cleanup(); }
  });

  it('F04-03: starter org 3 audits -> still allowed (limit = 4)', async () => {
    const { orgId, brandId, cleanup } = await fixture('starter');
    try {
      for (let i = 1; i <= 3; i++)
        await seedAudit({ organizationId: orgId, brandId, auditNumber: i });
      expect(await checkQuota(orgId, brandId)).toBe(true);
    } finally { await cleanup(); }
  });

  it('F04-04: starter org 4 audits -> blocked (limit = 4)', async () => {
    const { orgId, brandId, cleanup } = await fixture('starter');
    try {
      for (let i = 1; i <= 4; i++)
        await seedAudit({ organizationId: orgId, brandId, auditNumber: i });
      expect(await checkQuota(orgId, brandId)).toBe(false);
    } finally { await cleanup(); }
  });

  it('F04-05: growth org 12 audits -> blocked (limit = 12)', async () => {
    const { orgId, brandId, cleanup } = await fixture('growth');
    try {
      for (let i = 1; i <= 12; i++)
        await seedAudit({ organizationId: orgId, brandId, auditNumber: i });
      expect(await checkQuota(orgId, brandId)).toBe(false);
    } finally { await cleanup(); }
  });

  it('F04-06: enterprise org 100 audits -> still allowed (Infinity)', async () => {
    const { orgId, brandId, cleanup } = await fixture('enterprise');
    try {
      for (let i = 1; i <= 10; i++)
        await seedAudit({ organizationId: orgId, brandId, auditNumber: i });
      expect(await checkQuota(orgId, brandId)).toBe(true);
    } finally { await cleanup(); }
  });

  it('F04-07: historical audit (prior month) excluded from count (T1)', async () => {
    const { orgId, brandId, cleanup } = await fixture('free');
    try {
      await seedAudit({ organizationId: orgId, brandId,
        createdAt: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15) });
      expect(await checkQuota(orgId, brandId)).toBe(true);
    } finally { await cleanup(); }
  });

  it('F04-08: unknown orgId -> returns false (defensive)', async () => {
    const result = await checkQuota(
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001',
    );
    expect(result).toBe(false);
  });
});
