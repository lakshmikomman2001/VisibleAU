/**
 * tests/e2e/backend/05-brands-crud.test.ts
 *
 * E2E: GET /api/brands/[brandId], PATCH /api/brands/[brandId], DELETE /api/brands/[brandId]
 *
 * Sprint 1 §6 critical behaviours:
 *   - GET single: 200 with Brand directly (NO { brand } wrapper — §6 line 487 is unambiguous)
 *   - PATCH: 200 + { brand: Brand } wrapper (V4 fix — Sprint 4 UI reads body)
 *   - DELETE: 204 No Content; sets deletedAt; subsequent GET returns 404
 *   - Cross-org: ALWAYS 404, NEVER 401 (CLAUDE.md §7 — V5 fix)
 *
 * C3 FIX: GET single brand returns the Brand object directly (not wrapped in { brand }).
 *         Only POST (create) and PATCH (update) return { brand: Brand }.
 *         §6: "Returns: Brand[]" for list, no wrapper mentioned for GET single.
 *
 * C7 FIX: All imports are static — no dynamic import() inside test bodies.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { Brand } from "@/db/schema";
import {
  getActiveBrandsByOrg,
  getBrandById,
  seedBrand,
  seedOrganization,
  seedUser,
  truncateAll,
} from "./helpers/db";
import { del, get, getClerkToken, patch, request, TEST_USER_1, TEST_USER_2 } from "./helpers/http";

describe("/api/brands/[brandId]", () => {
  let token1: string;
  let token2: string;
  let org1Id: string;
  let org2Id: string;
  let brand1: Brand;

  beforeEach(async () => {
    await truncateAll();

    const org1 = await seedOrganization({
      clerkOrgId: TEST_USER_1.clerkOrgId,
      name: "Bondi Plumbing Co",
      region: "au",
      tier: "growth",
    });
    org1Id = org1.id;

    const org2 = await seedOrganization({
      clerkOrgId: TEST_USER_2.clerkOrgId,
      name: "Sydney Allied Health",
      region: "nz",
      tier: "starter",
    });
    org2Id = org2.id;

    await seedUser({
      clerkUserId: TEST_USER_1.clerkUserId,
      organizationId: org1Id,
      email: TEST_USER_1.email,
    });
    await seedUser({
      clerkUserId: TEST_USER_2.clerkUserId,
      organizationId: org2Id,
      email: TEST_USER_2.email,
    });

    brand1 = await seedBrand({
      organizationId: org1Id,
      name: "Bondi Plumbing",
      domain: "bondiplumbing.com.au",
      vertical: "tradies",
      region: "au",
      competitors: ["rival.com.au"],
      primaryRegions: ["NSW:Bondi"],
    });

    token1 = await getClerkToken(TEST_USER_1);
    token2 = await getClerkToken(TEST_USER_2);
  });

  // ─── GET single brand ─────────────────────────────────────────────────────

  describe("GET /api/brands/[brandId]", () => {
    it("returns 200 + brand directly (no wrapper) for own org brand", async () => {
      const { status, body } = await get(`/api/brands/${brand1.id}`, token1);

      expect(status).toBe(200);
      // C3 FIX: GET single returns Brand directly, not { brand: Brand }
      // Sprint 1 §6: POST/PATCH use { brand } wrapper; GET does not
      const brand = body as Brand;
      expect(brand.id).toBe(brand1.id);
      expect(brand.name).toBe("Bondi Plumbing");
      expect(brand.domain).toBe("bondiplumbing.com.au");
      expect(brand.vertical).toBe("tradies");
      expect(brand.region).toBe("au");
      expect(brand.organizationId).toBe(org1Id);
    });

    it("returns 404 for cross-org brand — NOT 401 (CLAUDE.md §7)", async () => {
      const { status } = await get(`/api/brands/${brand1.id}`, token2);
      expect(status).toBe(404);
      expect(status).not.toBe(401);
    });

    it("returns 404 for a brand that does not exist", async () => {
      const { status } = await get("/api/brands/00000000-0000-0000-0000-000000000000", token1);
      expect(status).toBe(404);
    });

    it("returns 401 without authentication", async () => {
      const { status } = await request(`/api/brands/${brand1.id}`, { method: "GET" });
      expect(status).toBe(401);
    });

    it("returns 404 for a soft-deleted brand", async () => {
      await del(`/api/brands/${brand1.id}`, token1);
      const { status } = await get(`/api/brands/${brand1.id}`, token1);
      expect(status).toBe(404);
    });
  });

  // ─── PATCH update brand ───────────────────────────────────────────────────

  describe("PATCH /api/brands/[brandId]", () => {
    it("returns 200 + { brand: Brand } wrapper (V4 fix — Sprint 4 reads body)", async () => {
      const { status, body } = await patch(
        `/api/brands/${brand1.id}`,
        { name: "Bondi Plumbing Services" },
        token1,
      );

      expect(status).toBe(200);
      // PATCH uses { brand } wrapper (V4 fix — Sprint 4 UI reads the updated brand)
      const { brand } = body as { brand: Brand };
      expect(brand.name).toBe("Bondi Plumbing Services");
      expect(brand.id).toBe(brand1.id);
    });

    it("persists the update to the DB", async () => {
      await patch(
        `/api/brands/${brand1.id}`,
        {
          name: "Cronulla Plumbing",
          domain: "cronullaplumbing.com.au",
          competitors: ["newrival.com.au"],
          primaryRegions: ["NSW:Cronulla"],
        },
        token1,
      );

      const inDb = await getBrandById(brand1.id);
      expect(inDb!.name).toBe("Cronulla Plumbing");
      expect(inDb!.domain).toBe("cronullaplumbing.com.au");
      expect(inDb!.competitors).toEqual(["newrival.com.au"]);
      expect(inDb!.primaryRegions).toEqual(["NSW:Cronulla"]);
    });

    it("does NOT update region (pinned at create — §12 anti-pattern)", async () => {
      const { status, body } = await patch(`/api/brands/${brand1.id}`, { region: "nz" }, token1);

      expect(status).toBe(200);
      const { brand } = body as { brand: Brand };
      expect(brand.region).toBe("au"); // unchanged

      const inDb = await getBrandById(brand1.id);
      expect(inDb!.region).toBe("au");
    });

    it("returns 404 for cross-org brand PATCH — NOT 401 (V5 fix)", async () => {
      const { status } = await patch(`/api/brands/${brand1.id}`, { name: "Hacked Name" }, token2);
      expect(status).toBe(404);
      expect(status).not.toBe(401);

      const inDb = await getBrandById(brand1.id);
      expect(inDb!.name).toBe("Bondi Plumbing");
    });

    it("returns 404 for non-existent brand PATCH", async () => {
      const { status } = await patch(
        "/api/brands/00000000-0000-0000-0000-000000000000",
        { name: "Ghost Brand" },
        token1,
      );
      expect(status).toBe(404);
    });

    it("returns 400 when PATCH body has invalid vertical", async () => {
      const { status } = await patch(
        `/api/brands/${brand1.id}`,
        { vertical: "invalid_vertical" },
        token1,
      );
      expect(status).toBe(400);
    });

    it("returns 401 without authentication", async () => {
      const { status } = await request(`/api/brands/${brand1.id}`, {
        method: "PATCH",
        body: { name: "Anon Update" },
      });
      expect(status).toBe(401);
    });
  });

  // ─── DELETE soft delete ───────────────────────────────────────────────────

  describe("DELETE /api/brands/[brandId]", () => {
    it("returns 204 on successful soft delete", async () => {
      const { status } = await del(`/api/brands/${brand1.id}`, token1);
      expect(status).toBe(204);
    });

    it("sets deletedAt — does NOT hard-delete the row (§12 anti-pattern)", async () => {
      await del(`/api/brands/${brand1.id}`, token1);

      const inDb = await getBrandById(brand1.id);
      expect(inDb).not.toBeNull(); // row still exists
      expect(inDb!.deletedAt).not.toBeNull(); // deletedAt is set
    });

    it("brand disappears from list after deletion", async () => {
      await del(`/api/brands/${brand1.id}`, token1);
      const active = await getActiveBrandsByOrg(org1Id);
      expect(active).toHaveLength(0);
    });

    it("subsequent GET returns 404 after deletion", async () => {
      await del(`/api/brands/${brand1.id}`, token1);
      const { status } = await get(`/api/brands/${brand1.id}`, token1);
      expect(status).toBe(404);
    });

    it("returns 404 for cross-org DELETE — NOT 401, NOT 204 (V5 fix)", async () => {
      const { status } = await del(`/api/brands/${brand1.id}`, token2);
      expect(status).toBe(404);
      expect(status).not.toBe(401);
      expect(status).not.toBe(204);

      // Brand must not be deleted
      const inDb = await getBrandById(brand1.id);
      expect(inDb!.deletedAt).toBeNull();
    });

    it("returns 404 for non-existent brand DELETE", async () => {
      const { status } = await del("/api/brands/00000000-0000-0000-0000-000000000000", token1);
      expect(status).toBe(404);
    });

    it("returns 401 without authentication", async () => {
      const { status } = await request(`/api/brands/${brand1.id}`, {
        method: "DELETE",
      });
      expect(status).toBe(401);
    });

    it("returns 404 if brand is already soft-deleted", async () => {
      await del(`/api/brands/${brand1.id}`, token1);
      const { status } = await del(`/api/brands/${brand1.id}`, token1);
      expect(status).toBe(404);
    });
  });

  // ─── Cross-org isolation matrix ───────────────────────────────────────────

  describe("cross-org isolation (CLAUDE.md §7 — 404 not 401)", () => {
    it("GET by org2 → 404 for org1 brand", async () => {
      expect((await get(`/api/brands/${brand1.id}`, token2)).status).toBe(404);
    });

    it("PATCH by org2 → 404, brand name unchanged in DB", async () => {
      const { status } = await patch(`/api/brands/${brand1.id}`, { name: "Attacker" }, token2);
      expect(status).toBe(404);
      expect((await getBrandById(brand1.id))!.name).toBe("Bondi Plumbing");
    });

    it("DELETE by org2 → 404, brand not soft-deleted", async () => {
      const { status } = await del(`/api/brands/${brand1.id}`, token2);
      expect(status).toBe(404);
      expect((await getBrandById(brand1.id))!.deletedAt).toBeNull();
    });

    it("cross-org 404 response body does not leak brand data", async () => {
      const { status, body } = await get(`/api/brands/${brand1.id}`, token2);
      expect(status).toBe(404);
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain("Bondi Plumbing");
      expect(bodyStr).not.toContain("bondiplumbing.com.au");
    });
  });
});
