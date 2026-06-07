/**
 * tests/e2e/backend/03-brands-list.test.ts
 *
 * E2E: GET /api/brands
 *
 * Sprint 1 §6: Returns Brand[] directly (no wrapper) where
 * organizationId = currentUser.organizationId and deletedAt IS NULL.
 *
 * C7 FIX: testDb and schema imported statically at module level.
 *         Drizzle soft-delete is done with static imports, not dynamic import().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { get, request, getClerkToken, TEST_USER_1, TEST_USER_2 } from './helpers/http';
import {
  truncateAll,
  seedOrganization,
  seedUser,
  seedBrand,
  testDb,
} from './helpers/db';
import * as schema from '../../../db/schema';
import type { Brand } from '../../../db/schema';
describe('GET /api/brands', () => {
  let token1: string;
  let token2: string;
  let org1Id: string;
  let org2Id: string;

  beforeEach(async () => {
    await truncateAll();

    const org1 = await seedOrganization({
      clerkOrgId: TEST_USER_1.clerkOrgId,
      name: 'Bondi Plumbing Co',
      region: 'au',
      tier: 'agency', // agency = 5 brands (sufficient for multi-brand list tests)
    });
    org1Id = org1.id;

    const org2 = await seedOrganization({
      clerkOrgId: TEST_USER_2.clerkOrgId,
      name: 'Sydney Allied Health',
      region: 'au',
      tier: 'starter',
    });
    org2Id = org2.id;

    await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
    await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

    token1 = await getClerkToken(TEST_USER_1);
    token2 = await getClerkToken(TEST_USER_2);
  });

  it('returns 401 without authentication', async () => {
    const { status } = await request('/api/brands', { method: 'GET' });
    expect(status).toBe(401);
  });

  it('returns 200 and empty array when org has no brands', async () => {
    const { status, body } = await get('/api/brands', token1);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as Brand[]).length).toBe(0);
  });

  it('returns only the current org\'s brands — not other orgs\'', async () => {
    await seedBrand({ organizationId: org1Id, name: 'Bondi Plumbing',      domain: 'bondiplumbing.com.au',     vertical: 'tradies' });
    await seedBrand({ organizationId: org1Id, name: 'Parramatta Plumbing', domain: 'paramattaplumbing.com.au', vertical: 'tradies' });
    await seedBrand({ organizationId: org2Id, name: 'Sydney Physio',       domain: 'sydneyphysio.com.au',      vertical: 'allied_health' });

    const { status, body } = await get('/api/brands', token1);
    expect(status).toBe(200);
    const brands = body as Brand[];
    expect(brands).toHaveLength(2);
    expect(brands.every((b) => b.organizationId === org1Id)).toBe(true);
    expect(brands.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Bondi Plumbing', 'Parramatta Plumbing']),
    );
  });

  it('excludes soft-deleted brands from the list', async () => {
    const active = await seedBrand({ organizationId: org1Id, name: 'Active Brand',  domain: 'activebrand.com.au' });
    const deleted = await seedBrand({ organizationId: org1Id, name: 'Deleted Brand', domain: 'deletedbrand.com.au' });

    // C7 FIX: soft-delete using statically imported testDb + schema (no dynamic import)
    await testDb
      .update(schema.brands)
      .set({ deletedAt: new Date() })
      .where(eq(schema.brands.id, deleted.id));

    const { status, body } = await get('/api/brands', token1);
    expect(status).toBe(200);
    const result = body as Brand[];
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);
  });

  it('response brands have the correct shape', async () => {
    await seedBrand({
      organizationId: org1Id,
      name: 'Cronulla Electrical',
      domain: 'cronullaelectrical.com.au',
      vertical: 'tradies',
      region: 'au',
      competitors: ['competitor1.com.au'],
      primaryRegions: ['NSW:Cronulla', 'NSW:Sutherland'],
    });

    const { body } = await get('/api/brands', token1);
    const [brand] = body as Brand[];

    expect(brand.id).toBeDefined();
    expect(brand.organizationId).toBe(org1Id);
    expect(brand.name).toBe('Cronulla Electrical');
    expect(brand.domain).toBe('cronullaelectrical.com.au');
    expect(brand.vertical).toBe('tradies');
    expect(brand.region).toBe('au');
    expect(brand.competitors).toEqual(['competitor1.com.au']);
    expect(brand.primaryRegions).toEqual(['NSW:Cronulla', 'NSW:Sutherland']);
    expect(brand.deletedAt).toBeNull();
  });

  it('org2 user only sees org2 brands', async () => {
    await seedBrand({ organizationId: org1Id, name: 'Org1 Brand', domain: 'org1brand.com.au' });
    const org2Brand = await seedBrand({
      organizationId: org2Id,
      name: 'Sydney Physio',
      domain: 'sydneyphysio.com.au',
      vertical: 'allied_health',
    });

    const { body } = await get('/api/brands', token2);
    const brands = body as Brand[];
    expect(brands).toHaveLength(1);
    expect(brands[0].id).toBe(org2Brand.id);
    expect(brands[0].organizationId).toBe(org2Id);
  });
});
