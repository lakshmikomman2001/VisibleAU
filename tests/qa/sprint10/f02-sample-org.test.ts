import { describe, it, expect, afterAll } from 'vitest';
import { db, schema }     from './shared/db';
import { cleanupSampleOrg } from './shared/seed';
import { eq }             from 'drizzle-orm';

afterAll(async () => { await cleanupSampleOrg(); });

describe('F02: ensureSampleOrg() idempotency (HC1, HH5)', () => {

  it('F02-01: creates sample org when absent — returns id', async () => {
    await cleanupSampleOrg();
    const [created] = await db.insert(schema.organizations)
      .values({ name: 'VisibleAU Sample', slug: 'sample', tier: 'free',
                region: 'au', metadata: {}, onboardingComplete: false,
                clerkOrgId: `org_sample_f02_${Date.now()}` })
      .onConflictDoNothing()
      .returning({ id: schema.organizations.id });
    expect(created?.id).toBeTruthy();
  });

  it('F02-02: second call returns same id (idempotent)', async () => {
    const [first]  = await db.select({ id: schema.organizations.id }).from(schema.organizations)
      .where(eq(schema.organizations.slug, 'sample')).limit(1);
    const [second] = await db.select({ id: schema.organizations.id }).from(schema.organizations)
      .where(eq(schema.organizations.slug, 'sample')).limit(1);
    expect(first?.id).toBe(second?.id);
  });

  it('F02-03: onConflictDoNothing leaves exactly ONE row even if called twice', async () => {
    await db.insert(schema.organizations)
      .values({ name: 'VisibleAU Sample', slug: 'sample', tier: 'free',
                region: 'au', metadata: {}, onboardingComplete: false,
                clerkOrgId: `org_sample_f02b_${Date.now()}` })
      .onConflictDoNothing();
    const rows = await db.select({ id: schema.organizations.id }).from(schema.organizations)
      .where(eq(schema.organizations.slug, 'sample'));
    expect(rows.length).toBe(1);
  });

  it('F02-04: sample org has tier = "free"', async () => {
    const [org] = await db.select({ tier: schema.organizations.tier }).from(schema.organizations)
      .where(eq(schema.organizations.slug, 'sample')).limit(1);
    expect(org?.tier).toBe('free');
  });

  it('F02-05: two parallel inserts — exactly one row survives (race safety)', async () => {
    await cleanupSampleOrg();
    await Promise.allSettled([
      db.insert(schema.organizations)
        .values({ name: 'VisibleAU Sample', slug: 'sample', tier: 'free',
                  region: 'au', metadata: {}, onboardingComplete: false,
                  clerkOrgId: `org_sample_race1_${Date.now()}` })
        .onConflictDoNothing(),
      db.insert(schema.organizations)
        .values({ name: 'VisibleAU Sample', slug: 'sample', tier: 'free',
                  region: 'au', metadata: {}, onboardingComplete: false,
                  clerkOrgId: `org_sample_race2_${Date.now()}` })
        .onConflictDoNothing(),
    ]);
    const rows = await db.select({ id: schema.organizations.id }).from(schema.organizations)
      .where(eq(schema.organizations.slug, 'sample'));
    expect(rows.length).toBe(1);
  });

  it('F02-06: AFTER cleanup — no sample org row remains in DB', async () => {
    await cleanupSampleOrg();
    const rows = await db.select({ id: schema.organizations.id }).from(schema.organizations)
      .where(eq(schema.organizations.slug, 'sample'));
    expect(rows.length).toBe(0);
  });
});
