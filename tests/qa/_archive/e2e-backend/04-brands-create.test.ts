/**
 * tests/e2e/backend/04-brands-create.test.ts
 *
 * E2E: POST /api/brands
 *
 * Sprint 1 §6: Zod validation, region inheritance, brand tier limits (V3 fix),
 * primaryRegions STATE:Suburb format (W4 fix), 201 + { brand: Brand } on success.
 *
 * C4 FIX: TIER_BRAND_LIMITS from Sprint 1 §6:
 *   { free: 1, starter: 1, growth: 1, agency: 5, agency_pro: 25, enterprise: Infinity }
 *   Growth tier = 1 brand (NOT more). Tests were using 'growth' assuming 2 brands allowed.
 *   Fixed: use 'agency' tier for multi-brand tests (limit: 5).
 *
 * C7 FIX: All imports are static at module level.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { Brand } from "@/db/schema";
import { getActiveBrandsByOrg, seedOrganization, seedUser, truncateAll } from "./helpers/db";
import { del, getClerkToken, post, request, TEST_USER_1 } from "./helpers/http";

describe("POST /api/brands", () => {
  let token: string;
  let orgId: string;

  const validBrand = {
    name: "Bondi Plumbing",
    domain: "bondiplumbing.com.au",
    vertical: "tradies",
    competitors: ["competitor1.com.au"],
    primaryRegions: ["NSW:Bondi", "NSW:Coogee"],
  };

  beforeEach(async () => {
    await truncateAll();

    // C4 FIX: use 'agency' for multi-brand tests. 'growth' limit is 1, same as free/starter.
    const org = await seedOrganization({
      clerkOrgId: TEST_USER_1.clerkOrgId,
      name: "Test Org",
      region: "au",
      tier: "agency", // agency = 5 brands allowed
    });
    orgId = org.id;

    await seedUser({
      clerkUserId: TEST_USER_1.clerkUserId,
      organizationId: orgId,
      email: TEST_USER_1.email,
    });

    token = await getClerkToken(TEST_USER_1);
  });

  // ─── Authentication ───────────────────────────────────────────────────────

  it("returns 401 without authentication", async () => {
    const { status } = await request("/api/brands", { method: "POST", body: validBrand });
    expect(status).toBe(401);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it("creates a brand and returns 201 + { brand: Brand } body", async () => {
    const { status, body } = await post("/api/brands", validBrand, token);

    expect(status).toBe(201);
    const { brand } = body as { brand: Brand };

    expect(brand.id).toBeDefined();
    expect(brand.name).toBe("Bondi Plumbing");
    expect(brand.domain).toBe("bondiplumbing.com.au");
    expect(brand.vertical).toBe("tradies");
    expect(brand.organizationId).toBe(orgId);
    expect(brand.deletedAt).toBeNull();
  });

  it("inherits region from the org (not from request body) — §12 anti-pattern", async () => {
    const { body } = await post("/api/brands", validBrand, token);
    const { brand } = body as { brand: Brand };
    expect(brand.region).toBe("au"); // org was seeded with region='au'
  });

  it("brand row is persisted to DB after create", async () => {
    const { body } = await post("/api/brands", validBrand, token);
    const { brand } = body as { brand: Brand };

    const active = await getActiveBrandsByOrg(orgId);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(brand.id);
  });

  it("strips https:// protocol and trailing slash from domain", async () => {
    const { status, body } = await post(
      "/api/brands",
      { ...validBrand, domain: "https://bondiplumbing.com.au/" },
      token,
    );
    expect(status).toBe(201);
    const { brand } = body as { brand: Brand };
    expect(brand.domain).toBe("bondiplumbing.com.au");
  });

  it("stores competitors and primaryRegions correctly", async () => {
    const { body } = await post(
      "/api/brands",
      {
        ...validBrand,
        competitors: ["rival1.com.au", "rival2.com.au"],
        primaryRegions: ["NSW:Bondi", "VIC:Fitzroy"],
      },
      token,
    );
    const { brand } = body as { brand: Brand };
    expect(brand.competitors).toEqual(["rival1.com.au", "rival2.com.au"]);
    expect(brand.primaryRegions).toEqual(["NSW:Bondi", "VIC:Fitzroy"]);
  });

  // ─── Zod validation (W4 fix — primaryRegions STATE:Suburb format) ─────────

  it("returns 400 when name is empty", async () => {
    const { status } = await post("/api/brands", { ...validBrand, name: "" }, token);
    expect(status).toBe(400);
  });

  it("returns 400 when domain is missing", async () => {
    const { domain: _d, ...noDomain } = validBrand;
    const { status } = await post("/api/brands", noDomain, token);
    expect(status).toBe(400);
  });

  it("returns 400 when vertical is invalid", async () => {
    const { status } = await post(
      "/api/brands",
      { ...validBrand, vertical: "invalid_vertical" },
      token,
    );
    expect(status).toBe(400);
  });

  it("returns 400 when primaryRegions missing STATE:Suburb colon separator", async () => {
    const { status } = await post(
      "/api/brands",
      { ...validBrand, primaryRegions: ["NSWBondi"] },
      token,
    );
    expect(status).toBe(400);
  });

  it("returns 400 when primaryRegions state is lowercase", async () => {
    const { status } = await post(
      "/api/brands",
      { ...validBrand, primaryRegions: ["nsw:Bondi"] },
      token,
    );
    expect(status).toBe(400);
  });

  it("accepts valid primaryRegions in STATE:Suburb format for multiple AU states", async () => {
    const { status } = await post(
      "/api/brands",
      {
        ...validBrand,
        name: "Multi Region Brand",
        domain: "multiregion.com.au",
        primaryRegions: ["NSW:Bondi", "VIC:Fitzroy", "QLD:Brisbane CBD", "WA:Fremantle"],
      },
      token,
    );
    expect(status).toBe(201);
  });

  it("accepts all valid verticals", async () => {
    const verticals = ["tradies", "allied_health", "saas"];
    for (const [i, vertical] of verticals.entries()) {
      const { status } = await post(
        "/api/brands",
        { ...validBrand, name: `Brand ${i}`, domain: `brand${i}.com.au`, vertical },
        token,
      );
      expect(status, `Expected 201 for vertical=${vertical}`).toBe(201);
    }
  });

  // ─── Brand tier limits (V3 fix — Sprint 1 §6) ─────────────────────────────

  describe("tier brand limits", () => {
    /**
     * C4 FIX: TIER_BRAND_LIMITS from Sprint 1 §6:
     *   free=1, starter=1, growth=1, agency=5, agency_pro=25
     * Growth is NOT special — it has the same 1-brand limit as free/starter.
     */

    it("free tier: 403 on second brand (limit=1)", async () => {
      await truncateAll();
      const org = await seedOrganization({
        clerkOrgId: TEST_USER_1.clerkOrgId,
        name: "Free Org",
        region: "au",
        tier: "free",
      });
      await seedUser({
        clerkUserId: TEST_USER_1.clerkUserId,
        organizationId: org.id,
        email: TEST_USER_1.email,
      });
      const t = await getClerkToken(TEST_USER_1);

      const first = await post("/api/brands", validBrand, t);
      expect(first.status).toBe(201);

      const second = await post(
        "/api/brands",
        { ...validBrand, name: "Brand 2", domain: "brand2.com.au" },
        t,
      );
      expect(second.status).toBe(403);
      expect((second.body as { error: string }).error).toMatch(/brand limit/i);
    });

    it("starter tier: 403 on second brand (limit=1)", async () => {
      await truncateAll();
      const org = await seedOrganization({
        clerkOrgId: TEST_USER_1.clerkOrgId,
        name: "Starter Org",
        region: "au",
        tier: "starter",
      });
      await seedUser({
        clerkUserId: TEST_USER_1.clerkUserId,
        organizationId: org.id,
        email: TEST_USER_1.email,
      });
      const t = await getClerkToken(TEST_USER_1);

      await post("/api/brands", validBrand, t);
      const { status } = await post(
        "/api/brands",
        { ...validBrand, name: "Brand 2", domain: "brand2.com.au" },
        t,
      );
      expect(status).toBe(403);
    });

    it("C4 FIX: growth tier: 403 on second brand (limit=1 — same as free/starter)", async () => {
      await truncateAll();
      const org = await seedOrganization({
        clerkOrgId: TEST_USER_1.clerkOrgId,
        name: "Growth Org",
        region: "au",
        tier: "growth",
      });
      await seedUser({
        clerkUserId: TEST_USER_1.clerkUserId,
        organizationId: org.id,
        email: TEST_USER_1.email,
      });
      const t = await getClerkToken(TEST_USER_1);

      await post("/api/brands", validBrand, t);
      const { status } = await post(
        "/api/brands",
        { ...validBrand, name: "Brand 2", domain: "brand2.com.au" },
        t,
      );
      expect(status).toBe(403); // growth has limit=1, not 2 or unlimited
    });

    it("agency tier: allows up to 5 brands, 403 on 6th", async () => {
      // beforeEach already creates an agency org — use it
      for (let i = 1; i <= 5; i++) {
        const { status } = await post(
          "/api/brands",
          { ...validBrand, name: `Agency Brand ${i}`, domain: `agencybrand${i}.com.au` },
          token,
        );
        expect(status, `Expected 201 for brand ${i}`).toBe(201);
      }

      const { status: sixthStatus } = await post(
        "/api/brands",
        { ...validBrand, name: "Brand 6", domain: "brand6.com.au" },
        token,
      );
      expect(sixthStatus).toBe(403);
    });

    it("soft-deleted brands do not count toward the limit", async () => {
      await truncateAll();
      const org = await seedOrganization({
        clerkOrgId: TEST_USER_1.clerkOrgId,
        name: "Free Org With Deleted",
        region: "au",
        tier: "free",
      });
      await seedUser({
        clerkUserId: TEST_USER_1.clerkUserId,
        organizationId: org.id,
        email: TEST_USER_1.email,
      });
      const t = await getClerkToken(TEST_USER_1);

      const first = await post("/api/brands", validBrand, t);
      const brand1Id = (first.body as { brand: Brand }).brand.id;

      // Delete the brand
      await del(`/api/brands/${brand1Id}`, t);

      // Create another — should succeed (deleted brand doesn't count)
      const { status } = await post(
        "/api/brands",
        { ...validBrand, name: "New Brand", domain: "newbrand.com.au" },
        t,
      );
      expect(status).toBe(201);
    });
  });
});
