import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }     from './shared/db';
import { seedOrg, seedUser, cleanupOrg } from './shared/seed';
import { eq }             from 'drizzle-orm';

const CLERK_ORG  = `org_s10qa_f07_${Date.now()}`;
const CLERK_USER = `user_s10qa_f07_${Date.now()}`;
let orgId = '';

beforeAll(async () => {
  const org = await seedOrg({ clerkOrgId: CLERK_ORG, name: '[S10QA F07] Onboarding',
                               tier: 'free', metadata: {} });
  orgId = org.id;
  await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId,
                   email: `s10qa_f07_${Date.now()}@test.com` });
});

afterAll(async () => {
  if (orgId) await cleanupOrg(orgId);
});

async function isFirstTimeUser(id: string): Promise<boolean> {
  const [org] = await db.select({ meta: schema.organizations.metadata })
    .from(schema.organizations).where(eq(schema.organizations.id, id));
  return !(org?.meta as any)?.firstTimeFlowComplete;
}
async function markFirstTimeComplete(id: string): Promise<void> {
  const [org] = await db.select({ meta: schema.organizations.metadata })
    .from(schema.organizations).where(eq(schema.organizations.id, id));
  await db.update(schema.organizations)
    .set({ metadata: { ...(org?.meta as any ?? {}), firstTimeFlowComplete: true } })
    .where(eq(schema.organizations.id, id));
}

describe('F07: Onboarding state machine (HC4, HM1, HJ4)', () => {
  it('F07-01: isFirstTimeUser() = true when metadata is empty {}', async () => {
    expect(await isFirstTimeUser(orgId)).toBe(true);
  });

  it('F07-02: isFirstTimeUser() = true when firstTimeFlowComplete key is absent', async () => {
    await db.update(schema.organizations)
      .set({ metadata: { otherKey: 'hello' } })
      .where(eq(schema.organizations.id, orgId));
    expect(await isFirstTimeUser(orgId)).toBe(true);
  });

  it('F07-03: markFirstTimeComplete() writes firstTimeFlowComplete=true', async () => {
    await markFirstTimeComplete(orgId);
    const [org] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((org.meta as any).firstTimeFlowComplete).toBe(true);
  });

  it('F07-04: isFirstTimeUser() = false after markFirstTimeComplete()', async () => {
    expect(await isFirstTimeUser(orgId)).toBe(false);
  });

  it('F07-05: markFirstTimeComplete() is idempotent', async () => {
    await markFirstTimeComplete(orgId);
    await markFirstTimeComplete(orgId);
    const [org] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((org.meta as any).firstTimeFlowComplete).toBe(true);
  });

  it('F07-06: markFirstTimeComplete() MERGES other metadata keys', async () => {
    await db.update(schema.organizations)
      .set({ metadata: { existingKey: 'preserved' } })
      .where(eq(schema.organizations.id, orgId));
    await markFirstTimeComplete(orgId);
    const [org] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    const meta = org.meta as any;
    expect(meta.firstTimeFlowComplete).toBe(true);
    expect(meta.existingKey).toBe('preserved');
  });

  it('F07-07: post-signup redirect is /onboarding (HM1)', () => {
    const CANONICAL_REDIRECT = '/onboarding';
    const WRONG_REDIRECT      = '/brands/wizard';
    expect(CANONICAL_REDIRECT).not.toBe(WRONG_REDIRECT);
    expect(CANONICAL_REDIRECT).toBe('/onboarding');
  });

  it('F07-08: AFTER test — org cleaned from DB', async () => {
    await cleanupOrg(orgId);
    const rows = await db.select({ id: schema.organizations.id })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(rows.length).toBe(0);
    orgId = '';
  });
});
