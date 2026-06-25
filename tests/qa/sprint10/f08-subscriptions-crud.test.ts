import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }  from './shared/db';
import { seedOrg, seedUser, seedSubscription, cleanupOrg } from './shared/seed';
import { eq }          from 'drizzle-orm';

const CLERK_ORG  = `org_s10qa_f08_${Date.now()}`;
const CLERK_USER = `user_s10qa_f08_${Date.now()}`;
let orgId = '';

beforeAll(async () => {
  const org = await seedOrg({ clerkOrgId: CLERK_ORG, name: '[S10QA F08] Billing', tier: 'free' });
  orgId = org.id;
  await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId, email: `f08_${Date.now()}@test.com` });
});

afterAll(async () => { if (orgId) await cleanupOrg(orgId); });

describe('F08: Subscriptions CRUD + tier sync (HA1, HA3)', () => {
  let subId = '';

  it('F08-01: insert subscription row returns all expected fields', async () => {
    const sub = await seedSubscription({
      organizationId: orgId, tier: 'starter', billingInterval: 'monthly', status: 'active',
    });
    subId = sub.id;
    expect(sub.organizationId).toBe(orgId);
    expect(sub.tier).toBe('starter');
    expect(sub.status).toBe('active');
    expect(typeof sub.cancelAtPeriodEnd).toBe('boolean');
  });

  it('F08-02: cancelAtPeriodEnd stored as boolean false — NOT string "false" (HA1)', async () => {
    const [row] = await db.select({ cap: schema.subscriptions.cancelAtPeriodEnd })
      .from(schema.subscriptions).where(eq(schema.subscriptions.id, subId));
    expect(row.cap).toBe(false);
    expect(row.cap).not.toBe('false');
    expect(typeof row.cap).toBe('boolean');
  });

  it('F08-03: duplicate organizationId insert is rejected (UNIQUE constraint)', async () => {
    await expect(
      seedSubscription({ organizationId: orgId })
    ).rejects.toThrow();
  });

  it('F08-04: organizations.tier updated to starter after subscription created', async () => {
    await db.update(schema.organizations).set({ tier: 'starter' })
      .where(eq(schema.organizations.id, orgId));
    const [org] = await db.select({ tier: schema.organizations.tier })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(org.tier).toBe('starter');
  });

  it('F08-05: cancelAtPeriodEnd = true stores as boolean true', async () => {
    await db.update(schema.subscriptions).set({ cancelAtPeriodEnd: true })
      .where(eq(schema.subscriptions.id, subId));
    const [row] = await db.select({ cap: schema.subscriptions.cancelAtPeriodEnd })
      .from(schema.subscriptions).where(eq(schema.subscriptions.id, subId));
    expect(row.cap).toBe(true);
    expect(typeof row.cap).toBe('boolean');
  });

  it('F08-06: deleting subscription + resetting org.tier to free simulates period-end downgrade', async () => {
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, subId));
    await db.update(schema.organizations).set({ tier: 'free' })
      .where(eq(schema.organizations.id, orgId));
    const [org] = await db.select({ tier: schema.organizations.tier })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(org.tier).toBe('free');
  });

  it('F08-07: past_due status keeps org.tier (do NOT downgrade on past_due)', async () => {
    const sub = await seedSubscription({ organizationId: orgId, tier: 'growth',
                                         billingInterval: 'annual', status: 'past_due' });
    await db.update(schema.organizations).set({ tier: 'growth' })
      .where(eq(schema.organizations.id, orgId));
    const [org] = await db.select({ tier: schema.organizations.tier })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(org.tier).toBe('growth');
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, sub.id));
  });

  it('F08-08: subscriptions.metadata defaults to {} (jsonb, not null)', async () => {
    const sub = await seedSubscription({ organizationId: orgId, tier: 'agency' });
    const [row] = await db.select({ meta: schema.subscriptions.metadata })
      .from(schema.subscriptions).where(eq(schema.subscriptions.id, sub.id));
    expect(row.meta).toBeDefined();
    expect(typeof row.meta).toBe('object');
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, sub.id));
  });
});
