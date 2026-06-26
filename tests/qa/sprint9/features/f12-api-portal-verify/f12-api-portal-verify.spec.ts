import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedClientPortalInvite, cleanupOrg } from '../../shared/seed';
import { eq }           from 'drizzle-orm';

let orgId='', brandId='';
let activeToken='', expiredToken='', revokedToken='';

beforeAll(async () => {
  const cid = `org_s9qa_f12_${Date.now()}`;
  const o = await seedOrg({ clerkOrgId: cid, name: '[S9QA] F12 Org' });
  orgId = o.id;
  await seedUser({ clerkUserId: `user_s9qa_f12_${Date.now()}`, organizationId: orgId,
    email: `f12_${Date.now()}@test.local` });
  const b = await seedBrand({ organizationId: orgId, name: '[S9QA] F12 Brand' });
  brandId = b.id;
  // Active invite — 30 days from now, not revoked
  const active  = await seedClientPortalInvite({ organizationId: orgId, brandId,
    isRevoked: false, expiresAt: new Date(Date.now() + 30 * 86_400_000),
    inviteeEmail: 'client@f12.com.au' });
  activeToken = active.inviteToken;
  // Expired invite — 1 second ago, not revoked
  const expired = await seedClientPortalInvite({ organizationId: orgId, brandId,
    isRevoked: false, expiresAt: new Date(Date.now() - 1_000) });
  expiredToken = expired.inviteToken;
  // Revoked invite — future expiry but revoked (T4)
  const revoked = await seedClientPortalInvite({ organizationId: orgId, brandId,
    isRevoked: true, expiresAt: new Date(Date.now() + 30 * 86_400_000) });
  revokedToken = revoked.inviteToken;
});
afterAll(async () => { await cleanupOrg(orgId); });

describe('[S9QA] F12 — client-portal verify token (GC2, T4) — DB + API', () => {

  it('F12-01: active invite has valid token and isRevoked=false', async () => {
    const [row] = await db.select().from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.inviteToken, activeToken));
    expect(row).toBeTruthy();
    expect(row.isRevoked).toBe(false);
    expect(row.brandId).toBe(brandId);
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('F12-02: active invite does NOT expose org secrets in DB row', async () => {
    const [row] = await db.select().from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.inviteToken, activeToken));
    const keys = Object.keys(row);
    expect(keys).not.toContain('ga4ApiSecret');
    expect(keys).not.toContain('clerkOrgId');
  });

  it('F12-03: expired invite has expiresAt in the past', async () => {
    const [row] = await db.select({ expiresAt: schema.clientPortalInvites.expiresAt })
      .from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.inviteToken, expiredToken));
    expect(row.expiresAt!.getTime()).toBeLessThan(Date.now());
  });

  it('F12-04: revoked invite has isRevoked=true despite future expiresAt (T4)', async () => {
    const [row] = await db.select({ isRevoked: schema.clientPortalInvites.isRevoked,
                                     expiresAt: schema.clientPortalInvites.expiresAt })
      .from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.inviteToken, revokedToken));
    expect(row.isRevoked).toBe(true);
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('F12-05: unknown token returns no rows from DB', async () => {
    const rows = await db.select().from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.inviteToken, 'this-token-does-not-exist-0000000'));
    expect(rows).toHaveLength(0);
  });

  it('F12-06: isRevoked is boolean type, not string (GF1)', async () => {
    const rows = await db.select({ isRevoked: schema.clientPortalInvites.isRevoked })
      .from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.organizationId, orgId));
    for (const r of rows) {
      expect(typeof r.isRevoked).toBe('boolean');
    }
  });

  it('F12-07: /api/client-portal/verify/[token] route file exists (GC2)', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/client-portal/verify/[token]/route.ts')).toBe(true);
  });

  it('F12-08: clientPortalViews can be inserted for active invite', async () => {
    const [invite] = await db.select().from(schema.clientPortalInvites)
      .where(eq(schema.clientPortalInvites.inviteToken, activeToken));
    await db.insert(schema.clientPortalViews).values({
      inviteId:       invite.id,
      organizationId: orgId,
      brandId:        brandId,
      viewedAt:       new Date(),
      pageViewed:     'verify-test',
    });
    const views = await db.select().from(schema.clientPortalViews)
      .where(eq(schema.clientPortalViews.inviteId, invite.id));
    expect(views.length).toBeGreaterThan(0);
  });
});
