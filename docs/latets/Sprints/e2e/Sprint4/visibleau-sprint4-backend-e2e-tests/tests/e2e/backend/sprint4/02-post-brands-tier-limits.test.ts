/**
 * tests/e2e/backend/sprint4/02-post-brands-tier-limits.test.ts
 *
 * POST /api/brands — BJ5 fix: brand tier limit enforcement (PRD §7).
 *
 * BRAND_LIMITS: { free:1, starter:1, growth:1, agency:5, agency_pro:25, enterprise:∞ }
 * Limit check: COUNT brands WHERE organizationId=X AND deletedAt IS NULL.
 * Over limit → 403 with upgrade message. Under limit → 201 with brand.
 *
 * TC-S4-09  Free tier: first brand → 201 (under limit)
 * TC-S4-10  Free tier: second brand → 403 (at limit = 1)
 * TC-S4-11  403 body contains upgrade error message
 * TC-S4-12  Agency tier: up to 5 brands allowed (under limit = 201)
 * TC-S4-13  Agency tier: 6th brand → 403 (at limit = 5)
 * TC-S4-14  Deleted brand does NOT count toward the limit (slot freed)
 * TC-S4-15  Unauthenticated POST /api/brands → 401
 * TC-S4-16  POST /api/brands with missing required fields → 400 or 422
 * TC-S4-17  Successfully created brand appears in GET /api/brands
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  testDb,
  seedOrganization,
  seedUser,
  seedBrand,
  deleteAllTestDataForOrg,
  getActiveBrandCount,
  getBrandById,
} from './helpers/db';
import {
  TEST_USER_1,
  TEST_USER_2,
  getClerkToken,
  createBrand,
  deleteBrand,
  getBrands,
  post,
  extractBrandId,
} from './helpers/http';
import * as schema from '../../../../../db/schema';
import { eq, isNull, and } from 'drizzle-orm';

let org1Id    = '';  // agency tier (limit=5)
let org2Id    = '';  // free tier   (limit=1)
let token1    = '';
let token2    = '';
// IDs of org1 brands created by tests (for cleanup)
const org1BrandIds: string[] = [];
// IDs of org2 brands created by tests (for cleanup)
const org2BrandIds: string[] = [];

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name:       'S4 BrandLimit Org 1 (agency)',
    tier:       'agency',
  });
  org1Id = org1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name:       'S4 BrandLimit Org 2 (free)',
    tier:       'free',
  });
  org2Id = org2.id;

  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  // Start clean
  await deleteAllTestDataForOrg(org1Id);
  await deleteAllTestDataForOrg(org2Id);

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAllTestDataForOrg(org1Id);
  if (org2Id) await deleteAllTestDataForOrg(org2Id);
});

describe('TC-S4-09 to TC-S4-17: POST /api/brands — tier limit enforcement (BJ5)', () => {

  it('TC-S4-09: free tier first brand → 201 (within limit of 1)', async () => {
    const { status, body } = await createBrand(token2, {
      name:   '[S4-E2E] Free Brand 1',
      domain: 'free1.e2e-s4.test',
    });
    expect(status).toBe(201);
    // D1 FIX: POST /api/brands returns { brand: Brand } per Sprint 1 spec
    const brandId09 = extractBrandId(body);
    expect(brandId09, 'TC-S4-09: brand ID missing from POST /api/brands response').toBeTruthy();
    org2BrandIds.push(brandId09 as string);
  });

  it('TC-S4-10: free tier second brand → 403 (at limit = 1)', async () => {
    // Org 2 now has 1 brand — limit for free tier is 1
    const activeBrands = await getActiveBrandCount(org2Id);
    expect(activeBrands).toBe(1);   // precondition

    const { status } = await createBrand(token2, {
      name:   '[S4-E2E] Free Brand 2',
      domain: 'free2.e2e-s4.test',
    });
    expect(status).toBe(403);
  });

  it('TC-S4-11: 403 body contains upgrade error message', async () => {
    const { body } = await createBrand(token2, {
      name:   '[S4-E2E] Free Brand 3',
      domain: 'free3.e2e-s4.test',
    });
    const b = body as Record<string, unknown>;
    expect(typeof b.error).toBe('string');
    // Error must mention the tier and upgrade (BJ5 spec message)
    expect((b.error as string).toLowerCase()).toMatch(/free|limit|upgrade|plan/i);
  });

  it('TC-S4-12: agency tier can create up to 5 brands (all within limit)', async () => {
    // Create 5 brands for agency org — all should be 201
    const results: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const { status, body } = await createBrand(token1, {
        name:   `[S4-E2E] Agency Brand ${i}`,
        domain: `agency${i}.e2e-s4.test`,
      });
      results.push(status);
      if (status === 201) {
        // D1 FIX: POST /api/brands returns { brand: Brand }
        const bid = extractBrandId(body);
        if (bid) org1BrandIds.push(bid);
      }
    }
    expect(results).toEqual([201, 201, 201, 201, 201]);
    const activeCount = await getActiveBrandCount(org1Id);
    expect(activeCount).toBe(5);
  });

  it('TC-S4-13: agency tier 6th brand → 403 (at limit = 5)', async () => {
    const activeCount = await getActiveBrandCount(org1Id);
    expect(activeCount).toBe(5);   // precondition

    const { status } = await createBrand(token1, {
      name:   '[S4-E2E] Agency Brand 6',
      domain: 'agency6.e2e-s4.test',
    });
    expect(status).toBe(403);
  });

  it('TC-S4-14: deleting a brand frees the slot — can create again', async () => {
    // Delete one of the 5 agency brands (via API)
    // C4 FIX: use org1BrandIds (not createdBrandIds which contained org2 brand at index 0)
    const brandToDeleteId = org1BrandIds.find(id => id);
    expect(brandToDeleteId, 'No org1 brand to delete — TC-S4-12 may have failed').toBeTruthy();

    const { status: deleteStatus } = await deleteBrand(token1, brandToDeleteId!);
    expect(deleteStatus).toBe(204);

    // Now active count is 4 — can create again
    const activeCount = await getActiveBrandCount(org1Id);
    expect(activeCount).toBe(4);

    const { status: createStatus, body } = await createBrand(token1, {
      name:   '[S4-E2E] Agency Brand 6 Retry',
      domain: 'agency6retry.e2e-s4.test',
    });
    expect(createStatus).toBe(201);
    const b = body as Record<string, unknown>;
    // D1 FIX: POST /api/brands returns { brand: Brand }
    const bid14 = extractBrandId(body);
    if (bid14) org1BrandIds.push(bid14);
  });

  it('TC-S4-15: unauthenticated POST /api/brands → 401', async () => {
    const { status } = await post('/api/brands', {
      name:   '[S4-E2E] No Auth Brand',
      domain: 'noauth.e2e-s4.test',
    });
    expect(status).toBe(401);
  });

  it('TC-S4-16: POST /api/brands with missing domain → 400 or 422', async () => {
    const { status } = await createBrand(token1, {
      name:   '[S4-E2E] Missing Domain',
      domain: '', // empty domain
    });
    expect([400, 422]).toContain(status);
  });

  it('TC-S4-17: successfully created brand appears in GET /api/brands', async () => {
    // Create a fresh brand for Org 2 after the free-limit test cleans up
    // First delete org2's brand to free the slot
    const { body: brandListBody } = await getBrands(token2);
    const org2Brands = brandListBody as Array<Record<string, unknown>>;
    if (org2Brands.length > 0) {
      await deleteBrand(token2, org2Brands[0].id as string);
    }

    const { status: createStatus, body: createBody } = await createBrand(token2, {
      name:   '[S4-E2E] Verify Brand',
      domain: 'verify.e2e-s4.test',
    });
    expect(createStatus).toBe(201);
    // D1 FIX: POST /api/brands returns { brand: Brand }
    const createdId = extractBrandId(createBody);
    expect(createdId, 'TC-S4-17: brand ID missing from POST response').toBeTruthy();

    const { body: listBody } = await getBrands(token2);
    const list = listBody as Array<Record<string, unknown>>;
    const found = list.find(b => b.id === createdId);
    expect(found).toBeDefined();
    expect(found!.name).toContain('Verify Brand');
  });
});
