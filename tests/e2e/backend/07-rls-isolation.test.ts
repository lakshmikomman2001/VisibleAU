/**
 * tests/e2e/backend/07-rls-isolation.test.ts
 *
 * E2E: Row Level Security isolation — verified via HTTP.
 *
 * Sprint 1 §5 + §11: "Defense-in-depth — RLS is the DB backstop."
 *
 * G1/G10 FIX: Previous versions attempted direct-DB RLS tests using postgres-js.
 * This is not practically achievable for two compounding reasons:
 *
 *   1. DATABASE_URL connects as the Postgres superuser. Superusers bypass RLS
 *      unconditionally in PostgreSQL — all row filters would be ignored.
 *
 *   2. SUPABASE_URL is 'https://[ref].supabase.co' (the REST API URL).
 *      postgres-js requires a 'postgresql://' connection string. Passing an HTTPS
 *      URL throws a connection error immediately.
 *
 *   3. Even with the correct Supabase pooler URL, the pooler connects as the
 *      postgres superuser — same problem as (1).
 *
 * Correct approach: test isolation through the running app's HTTP API.
 * The app correctly calls setRlsContext() before every DB query, which sets
 * app.current_org_id so the RLS policies apply. Testing via HTTP exercises
 * the full stack: Clerk auth → API route → setRlsContext → DB RLS → result.
 * This is more valuable than bypassed direct-DB tests anyway.
 *
 * C2 FIX: sql from 'drizzle-orm', not schema.
 * C5 FIX: Consistent type imports.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { Brand, Organization, User } from "@/db/schema";
import * as schema from "@/db/schema";
import { seedBrand, seedOrganization, seedUser, testDb, truncateAll } from "./helpers/db";
import { del, get, getClerkToken, patch, TEST_USER_1, TEST_USER_2 } from "./helpers/http";

describe("RLS isolation via HTTP (Sprint 1 §5 defense-in-depth)", () => {
  let org1: Organization;
  let org2: Organization;
  let _user1: User;
  let brand1: Brand;
  let brand2: Brand;
  let token1: string;
  let token2: string;

  beforeEach(async () => {
    await truncateAll();

    org1 = await seedOrganization({
      clerkOrgId: TEST_USER_1.clerkOrgId,
      name: "Org One",
      region: "au",
      tier: "agency",
    });
    org2 = await seedOrganization({
      clerkOrgId: TEST_USER_2.clerkOrgId,
      name: "Org Two",
      region: "au",
      tier: "starter",
    });

    _user1 = await seedUser({
      clerkUserId: TEST_USER_1.clerkUserId,
      organizationId: org1.id,
      email: TEST_USER_1.email,
    });
    await seedUser({
      clerkUserId: TEST_USER_2.clerkUserId,
      organizationId: org2.id,
      email: TEST_USER_2.email,
    });

    brand1 = await seedBrand({
      organizationId: org1.id,
      name: "Brand One",
      domain: "brandone.com.au",
    });
    brand2 = await seedBrand({
      organizationId: org2.id,
      name: "Brand Two",
      domain: "brandtwo.com.au",
    });

    token1 = await getClerkToken(TEST_USER_1);
    token2 = await getClerkToken(TEST_USER_2);
  });

  describe("Brand read isolation", () => {
    it("GET own brand returns 200", async () => {
      const { status } = await get(`/api/brands/${brand1.id}`, token1);
      expect(status).toBe(200);
    });

    it("GET cross-org brand returns 404, never 401 (CLAUDE.md §7)", async () => {
      const { status } = await get(`/api/brands/${brand1.id}`, token2);
      expect(status).toBe(404);
      expect(status).not.toBe(401);
    });

    it("GET list for org1 returns only org1 brands", async () => {
      const { status, body } = await get("/api/brands", token1);
      expect(status).toBe(200);
      const brands = body as Brand[];
      expect(brands).toHaveLength(1);
      expect(brands[0].id).toBe(brand1.id);
      expect(brands[0].organizationId).toBe(org1.id);
    });

    it("GET list for org2 returns only org2 brands", async () => {
      const { status, body } = await get("/api/brands", token2);
      expect(status).toBe(200);
      const brands = body as Brand[];
      expect(brands).toHaveLength(1);
      expect(brands[0].id).toBe(brand2.id);
      expect(brands[0].organizationId).toBe(org2.id);
    });

    it("cross-org 404 response body does not leak brand name or domain", async () => {
      const { status, body } = await get(`/api/brands/${brand1.id}`, token2);
      expect(status).toBe(404);
      const str = JSON.stringify(body);
      expect(str).not.toContain("Brand One");
      expect(str).not.toContain("brandone.com.au");
    });
  });

  describe("Brand write isolation", () => {
    it("PATCH cross-org brand returns 404 and brand is unchanged in DB", async () => {
      const { status } = await patch(`/api/brands/${brand1.id}`, { name: "Hacked Name" }, token2);
      expect(status).toBe(404);

      const inDb = await testDb.select().from(schema.brands);
      const b1 = inDb.find((b) => b.id === brand1.id);
      expect(b1!.name).toBe("Brand One");
    });

    it("DELETE cross-org brand returns 404 and deletedAt remains null", async () => {
      const { status } = await del(`/api/brands/${brand1.id}`, token2);
      expect(status).toBe(404);

      const [_inDb] = await testDb.select().from(schema.brands);
      const b1 = (await testDb.select().from(schema.brands)).find((b) => b.id === brand1.id);
      expect(b1!.deletedAt).toBeNull();
    });
  });

  describe("Service-role bypass (for Inngest/webhooks)", () => {
    it("testDb (service-role) sees all brands across all orgs", async () => {
      const all = await testDb.select().from(schema.brands);
      // Service role bypasses RLS — can see both org1 and org2 brands
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.some((b) => b.id === brand1.id)).toBe(true);
      expect(all.some((b) => b.id === brand2.id)).toBe(true);
    });
  });

  describe("org and user row isolation", () => {
    it("org1 user can only read own brands via API — not org2", async () => {
      // Verified by GET list returning only own org's brands (above)
      // Additional: direct attempt to access org2's brand returns 404
      const { status } = await get(`/api/brands/${brand2.id}`, token1);
      expect(status).toBe(404);
    });
  });
});
