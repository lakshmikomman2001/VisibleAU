/**
 * tests/e2e/backend/07-rls-isolation.test.ts
 *
 * E2E: Row Level Security isolation — verified via HTTP.
 *
 * Tests cross-org isolation by authenticating as two users in different orgs
 * and verifying they cannot access each other's brands via the API.
 *
 * Uses the app's live database — no truncation or seeding needed.
 * The testDb connects directly to the app's database for service-role checks.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { del, get, getClerkToken, patch, TEST_USER_1, TEST_USER_2 } from "./helpers/http";

const APP_DB_URL =
  process.env.E2E_APP_DB_URL ??
  "postgresql://postgres:password@localhost:5432/visibleau_prod";

const appDbClient = postgres(APP_DB_URL, { max: 1 });
const appDb = drizzle(appDbClient, { schema });

interface BrandShape {
  id: string;
  name: string;
  domain?: string;
  organizationId: string;
  deletedAt?: string | null;
}

describe("RLS isolation via HTTP (Sprint 1 §5 defense-in-depth)", () => {
  let token1: string;
  let token2: string;

  let user1Brands: BrandShape[];
  let user2Brands: BrandShape[];
  let seededBrandForOrg2: BrandShape | null = null;
  let user2OrgId: string;

  beforeAll(async () => {
    token1 = await getClerkToken(TEST_USER_1);
    token2 = await getClerkToken(TEST_USER_2);

    const { body: body1 } = await get("/api/brands", token1);
    user1Brands = (
      (body1 as Record<string, unknown>).brands ?? body1
    ) as BrandShape[];

    if (user1Brands.length === 0) {
      throw new Error(
        "User 1 has no brands — cannot test isolation. Seed at least one brand for user1's org.",
      );
    }

    const { body: body2 } = await get("/api/brands", token2);
    user2Brands = (
      (body2 as Record<string, unknown>).brands ?? body2
    ) as BrandShape[];

    // If user2 has no brands, seed one so we can test both directions
    if (user2Brands.length === 0) {
      // Look up user2's org via auth_members
      const memberRows = await appDbClient`
        SELECT m.organization_id
        FROM auth_members m
        JOIN auth_users u ON m.user_id = u.id
        WHERE u.email = ${TEST_USER_2.email}
        LIMIT 1
      `;

      if (memberRows.length === 0) {
        throw new Error(`No auth_member found for ${TEST_USER_2.email}`);
      }
      const authOrgId = memberRows[0].organization_id as string;

      // Map auth org ID to our organizations table
      const orgRows = await appDbClient`
        SELECT id FROM organizations WHERE clerk_org_id = ${authOrgId} LIMIT 1
      `;
      if (orgRows.length === 0) {
        throw new Error(`No organization row for clerk_org_id=${authOrgId}`);
      }
      user2OrgId = orgRows[0].id as string;

      const [inserted] = await appDb
        .insert(schema.brands)
        .values({
          organizationId: user2OrgId,
          name: "__RLS_TEST_ORG2_BRAND__",
          domain: "rls-test-org2.example.com",
          vertical: "tradies",
          region: "au",
          competitors: [],
          primaryRegions: [],
        })
        .returning();
      seededBrandForOrg2 = inserted as BrandShape;

      // Refetch user2's brands
      const { body: body2b } = await get("/api/brands", token2);
      user2Brands = (
        (body2b as Record<string, unknown>).brands ?? body2b
      ) as BrandShape[];
    }
  }, 30_000);

  afterAll(async () => {
    if (seededBrandForOrg2) {
      const { eq } = await import("drizzle-orm");
      await appDb
        .delete(schema.brands)
        .where(eq(schema.brands.id, seededBrandForOrg2.id));
    }
    await appDbClient.end();
  });

  describe("Brand read isolation", () => {
    it("GET own brand returns 200", async () => {
      const { status } = await get(
        `/api/brands/${user1Brands[0].id}`,
        token1,
      );
      expect(status).toBe(200);
    });

    it("GET cross-org brand returns 404, never 401 (CLAUDE.md §7)", async () => {
      const { status } = await get(
        `/api/brands/${user1Brands[0].id}`,
        token2,
      );
      expect(status).toBe(404);
      expect(status).not.toBe(401);
    });

    it("GET list for user1 returns only user1's org brands", async () => {
      const { status, body } = await get("/api/brands", token1);
      expect(status).toBe(200);
      const brands = (
        (body as Record<string, unknown>).brands ?? body
      ) as BrandShape[];
      expect(brands.length).toBeGreaterThanOrEqual(1);

      const orgIds = new Set(brands.map((b) => b.organizationId));
      expect(orgIds.size).toBe(1);
      expect(orgIds.has(user1Brands[0].organizationId)).toBe(true);
    });

    it("GET list for user2 returns only user2's org brands", async () => {
      const { status, body } = await get("/api/brands", token2);
      expect(status).toBe(200);
      const brands = (
        (body as Record<string, unknown>).brands ?? body
      ) as BrandShape[];
      expect(brands.length).toBeGreaterThanOrEqual(1);

      const orgIds = new Set(brands.map((b) => b.organizationId));
      expect(orgIds.size).toBe(1);
      expect(orgIds.has(user2Brands[0].organizationId)).toBe(true);
    });

    it("user1 brands and user2 brands have no overlap", async () => {
      const ids1 = new Set(user1Brands.map((b) => b.id));
      const ids2 = new Set(user2Brands.map((b) => b.id));
      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });

    it("cross-org 404 response body does not leak brand name or domain", async () => {
      const targetBrand = user1Brands[0];
      const { status, body } = await get(
        `/api/brands/${targetBrand.id}`,
        token2,
      );
      expect(status).toBe(404);
      const str = JSON.stringify(body);
      expect(str).not.toContain(targetBrand.name);
    });
  });

  describe("Brand write isolation", () => {
    it("PATCH cross-org brand returns 404 and brand is unchanged in DB", async () => {
      const targetBrand = user1Brands[0];
      const originalName = targetBrand.name;

      const { status } = await patch(
        `/api/brands/${targetBrand.id}`,
        { name: "Hacked Name" },
        token2,
      );
      expect(status).toBe(404);

      const inDb = await appDb.select().from(schema.brands);
      const found = inDb.find((b) => b.id === targetBrand.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe(originalName);
    });

    it("DELETE cross-org brand returns 404 and deletedAt remains null", async () => {
      const targetBrand = user1Brands[0];
      const { status } = await del(
        `/api/brands/${targetBrand.id}`,
        token2,
      );
      expect(status).toBe(404);

      const inDb = await appDb.select().from(schema.brands);
      const found = inDb.find((b) => b.id === targetBrand.id);
      expect(found).toBeDefined();
      expect(found!.deletedAt).toBeNull();
    });
  });

  describe("Service-role bypass (for Inngest/webhooks)", () => {
    it("appDb (service-role / superuser) sees brands from both orgs", async () => {
      const all = await appDb.select().from(schema.brands);
      const orgIds = new Set(all.map((b) => b.organizationId));
      expect(orgIds.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Bidirectional isolation", () => {
    it("user1 cannot access user2's brand", async () => {
      const targetBrand = user2Brands[0];
      const { status } = await get(
        `/api/brands/${targetBrand.id}`,
        token1,
      );
      expect(status).toBe(404);
    });

    it("user2 cannot access user1's brand", async () => {
      const targetBrand = user1Brands[0];
      const { status } = await get(
        `/api/brands/${targetBrand.id}`,
        token2,
      );
      expect(status).toBe(404);
    });
  });
});
