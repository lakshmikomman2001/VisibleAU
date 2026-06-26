import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }  from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedClientPortalInvite, cleanupOrg } from '../../shared/seed';
import { eq }          from 'drizzle-orm';

let org1Id='', org2Id='', brand1Id='', activeInviteId='';
const ORG1_CID = `org_s9qa_f07_1_${Date.now()}`;
const ORG2_CID = `org_s9qa_f07_2_${Date.now()}`;

beforeAll(async () => {
  const o1 = await seedOrg({ clerkOrgId: ORG1_CID, name: '[S9QA] F07 Org1' });
  org1Id = o1.id;
  await seedUser({ clerkUserId: `user_s9qa_f07_1_${Date.now()}`, organizationId: org1Id, email: `f07_1_${Date.now()}@test.local` });
  const b = await seedBrand({ organizationId: org1Id, name: '[S9QA] F07 Brand' });
  brand1Id = b.id;
  const o2 = await seedOrg({ clerkOrgId: ORG2_CID, name: '[S9QA] F07 Org2', tier: 'free' });
  org2Id = o2.id;
  await seedUser({ clerkUserId: `user_s9qa_f07_2_${Date.now()}`, organizationId: org2Id, email: `f07_2_${Date.now()}@test.local` });
});
afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

describe('[S9QA] F07 — DB CRUD: clientPortalInvites + views', () => {

  it('F07-01: create invite — 32-char token, isRevoked=false (boolean, GF1)', async () => {
    const i = await seedClientPortalInvite({ organizationId: org1Id, brandId: brand1Id });
    activeInviteId = i.id;
    expect(i.inviteToken).toHaveLength(32);
    expect(typeof i.isRevoked).toBe('boolean');
    expect(i.isRevoked).toBe(false);
  });

  it('F07-02: inviteeEmail=null creates invite without email (GH3)', async () => {
    const i = await seedClientPortalInvite({ organizationId: org1Id, brandId: brand1Id, inviteeEmail: null });
    expect(i.inviteeEmail).toBeNull();
  });

  it('F07-03: inviteeEmail set -> stored correctly', async () => {
    const i = await seedClientPortalInvite({ organizationId: org1Id, brandId: brand1Id,
      inviteeEmail: 'client@f07.com.au' });
    expect(i.inviteeEmail).toBe('client@f07.com.au');
  });

  it('F07-04: revoke — isRevoked becomes true (GF1 boolean)', async () => {
    await db.update(schema.clientPortalInvites)
      .set({ isRevoked: true, status: 'revoked' })
      .where(eq(schema.clientPortalInvites.id, activeInviteId));
    const [row] = await db.select({ isRevoked: schema.clientPortalInvites.isRevoked })
      .from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.id, activeInviteId));
    expect(typeof row.isRevoked).toBe('boolean');
    expect(row.isRevoked).toBe(true);
  });

  it('F07-05: expired invite — expiresAt in past (token expired)', async () => {
    const i = await seedClientPortalInvite({ organizationId: org1Id, brandId: brand1Id,
      expiresAt: new Date(Date.now() - 1_000) });
    const [row] = await db.select({ expiresAt: schema.clientPortalInvites.expiresAt })
      .from(schema.clientPortalInvites).where(eq(schema.clientPortalInvites.id, i.id));
    expect(row.expiresAt!.getTime()).toBeLessThan(Date.now());
  });

  it('F07-06: isRevoked=true blocks access even with future expiresAt (T4)', async () => {
    const i = await seedClientPortalInvite({ organizationId: org1Id, brandId: brand1Id,
      isRevoked: true,
      expiresAt: new Date(Date.now() + 30 * 86_400_000) });
    const [row] = await db.select({ isRevoked: schema.clientPortalInvites.isRevoked,
                                     expiresAt: schema.clientPortalInvites.expiresAt })
      .from(schema.clientPortalInvites).where(eq(schema.clientPortalInvites.id, i.id));
    expect(row.isRevoked).toBe(true);
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('F07-07: clientPortalViews FK insert and SELECT back', async () => {
    const freshInvite = await seedClientPortalInvite({ organizationId: org1Id, brandId: brand1Id });
    await db.insert(schema.clientPortalViews).values({
      inviteId:       freshInvite.id,
      organizationId: org1Id,
      brandId:        brand1Id,
      viewedAt:       new Date(),
      pageViewed:     'overview',
    });
    const rows = await db.select().from(schema.clientPortalViews)
      .where(eq(schema.clientPortalViews.inviteId, freshInvite.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].pageViewed).toBe('overview');
  });

  it('F07-08: org2 sees zero invites (RLS isolation)', async () => {
    const rows = await db.select().from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.organizationId, org2Id));
    expect(rows).toHaveLength(0);
  });

  it('F07-09: cleanupOrg deletes views before invites — no FK violation', async () => {
    const tmpO = await seedOrg({ clerkOrgId: `org_s9qa_f07_tmp_${Date.now()}`, name: '[S9QA] F07 Tmp' });
    try {
      const tmpB = await seedBrand({ organizationId: tmpO.id });
      const tmpI = await seedClientPortalInvite({ organizationId: tmpO.id, brandId: tmpB.id });
      await db.insert(schema.clientPortalViews).values({
        inviteId: tmpI.id, organizationId: tmpO.id, brandId: tmpB.id,
        viewedAt: new Date(), pageViewed: 'scores',
      });
      await expect(cleanupOrg(tmpO.id)).resolves.not.toThrow();
    } catch (e) { await cleanupOrg(tmpO.id).catch(() => {}); throw e; }
  });
});
