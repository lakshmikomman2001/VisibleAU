/**
 * tests/e2e/backend/09-acceptance.test.ts
 *
 * E2E: Sprint 1 §11 Acceptance Criteria — backend verification only.
 *
 * This file is a single-pass smoke test that touches every backend
 * acceptance criterion from Sprint 1 §11 in order, using real DB data.
 * Run this after all other E2E tests pass to confirm Sprint 1 is done.
 *
 * Each test maps directly to a §11 acceptance criterion.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Brand } from "@/db/schema";
import * as schema from "@/db/schema";
import { getActiveBrandsByOrg, getBrandById, testDb, truncateAll } from "./helpers/db";
import {
  del,
  get,
  getClerkToken,
  getPublic,
  patch,
  post,
  postPublic,
  request,
  TEST_USER_1,
  TEST_USER_2,
} from "./helpers/http";
import { membershipCreatedPayload, orgCreatedPayload, signWebhook } from "./helpers/svix";

let token1: string;
let token2: string;
let org1Id: string;

beforeAll(async () => {
  await truncateAll();

  // Simulate the Clerk webhook flow to get real org + user rows
  // (mirrors the actual signup flow)
  const orgPayload1 = orgCreatedPayload({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name: "Acceptance Org 1 — Bondi Plumbing",
    region: "au",
    tier: "growth",
  });
  const { rawBody: rb1, headers: h1 } = signWebhook(orgPayload1, "organization.created");
  await postPublic("/api/webhooks/clerk", undefined, h1, rb1);

  const memberPayload1 = membershipCreatedPayload({
    clerkUserId: TEST_USER_1.clerkUserId,
    clerkOrgId: TEST_USER_1.clerkOrgId,
    email: TEST_USER_1.email,
    name: "Test User 1",
  });
  const { rawBody: mrb1, headers: mh1 } = signWebhook(
    memberPayload1,
    "organizationMembership.created",
  );
  await postPublic("/api/webhooks/clerk", undefined, mh1, mrb1);

  const orgPayload2 = orgCreatedPayload({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name: "Acceptance Org 2 — Sydney Allied Health",
    region: "au",
    tier: "starter",
  });
  const { rawBody: rb2, headers: h2 } = signWebhook(orgPayload2, "organization.created");
  await postPublic("/api/webhooks/clerk", undefined, h2, rb2);

  const memberPayload2 = membershipCreatedPayload({
    clerkUserId: TEST_USER_2.clerkUserId,
    clerkOrgId: TEST_USER_2.clerkOrgId,
    email: TEST_USER_2.email,
    name: "Test User 2",
  });
  const { rawBody: mrb2, headers: mh2 } = signWebhook(
    memberPayload2,
    "organizationMembership.created",
  );
  await postPublic("/api/webhooks/clerk", undefined, mh2, mrb2);

  // Resolve org1 ID from the DB (needed for acceptance tests below)
  const [o1] = await testDb
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, TEST_USER_1.clerkOrgId));
  // G2 FIX: o2 / org2Id removed — org2 data accessed via token2 (Clerk session)
  // and the 403 brand-limit test uses token2 directly without needing the DB org ID.

  org1Id = o1.id;

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  await truncateAll();
});

describe("Sprint 1 §11 Acceptance Criteria — Backend", () => {
  let createdBrandId: string;

  it("§11: Clerk webhook creates organizations row with correct region + tier", async () => {
    const [org] = await testDb
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.clerkOrgId, TEST_USER_1.clerkOrgId));

    expect(org).toBeDefined();
    expect(org.region).toBe("au");
    expect(org.tier).toBe("growth");
    expect(org.deletedAt).toBeNull();
  });

  it("§11: Clerk webhook creates users row linked to org", async () => {
    const [user] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerkUserId, TEST_USER_1.clerkUserId));

    expect(user).toBeDefined();
    expect(user.organizationId).toBe(org1Id);
    expect(user.email).toBe(TEST_USER_1.email);
  });

  it("§11: User can create a brand (POST /api/brands → 201)", async () => {
    const { status, body } = await post(
      "/api/brands",
      {
        name: "Bondi Plumbing",
        domain: "bondiplumbing.com.au",
        vertical: "tradies",
        competitors: ["rival.com.au"],
        primaryRegions: ["NSW:Bondi"],
      },
      token1,
    );

    expect(status).toBe(201);
    const { brand } = body as { brand: Brand };
    createdBrandId = brand.id;
    expect(brand.name).toBe("Bondi Plumbing");
    expect(brand.organizationId).toBe(org1Id);
    expect(brand.region).toBe("au"); // inherited from org
  });

  it("§11: Brand appears in the list (GET /api/brands)", async () => {
    const { status, body } = await get("/api/brands", token1);
    expect(status).toBe(200);
    const brands = body as Brand[];
    const found = brands.find((b) => b.id === createdBrandId);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Bondi Plumbing");
  });

  it("§11: Brand can be retrieved individually (GET /api/brands/[id])", async () => {
    const { status, body } = await get(`/api/brands/${createdBrandId}`, token1);
    expect(status).toBe(200);
    // C3 FIX: GET single returns Brand directly — no { brand } wrapper
    const brand = body as Brand;
    expect(brand.id).toBe(createdBrandId);
  });

  it("§11: Brand can be updated inline (PATCH → 200 + brand body)", async () => {
    const { status, body } = await patch(
      `/api/brands/${createdBrandId}`,
      { name: "Bondi Plumbing Services" },
      token1,
    );
    expect(status).toBe(200);
    const { brand } = body as { brand: Brand };
    expect(brand.name).toBe("Bondi Plumbing Services");
  });

  it("§11: Region is pinned (PATCH cannot change region)", async () => {
    await patch(`/api/brands/${createdBrandId}`, { region: "nz" }, token1);
    const inDb = await getBrandById(createdBrandId);
    expect(inDb!.region).toBe("au");
  });

  it("§11: Second org user cannot see first org's brand — returns 404", async () => {
    const { status } = await get(`/api/brands/${createdBrandId}`, token2);
    expect(status).toBe(404);
    expect(status).not.toBe(401); // Must be 404 per CLAUDE.md §7
  });

  it("§11: Cross-org DELETE returns 404 (not 204 or 500)", async () => {
    const { status } = await del(`/api/brands/${createdBrandId}`, token2);
    expect(status).toBe(404);
  });

  it("§11: Brand can be deleted (DELETE → 204, soft-delete, disappears from list)", async () => {
    const { status } = await del(`/api/brands/${createdBrandId}`, token1);
    expect(status).toBe(204);

    // Row still exists but deletedAt is set
    const inDb = await getBrandById(createdBrandId);
    expect(inDb!.deletedAt).not.toBeNull();

    // Brand does not appear in list
    const active = await getActiveBrandsByOrg(org1Id);
    expect(active.find((b) => b.id === createdBrandId)).toBeUndefined();

    // GET returns 404
    const { status: getStatus } = await get(`/api/brands/${createdBrandId}`, token1);
    expect(getStatus).toBe(404);
  });

  it("§11: Free-tier org with 1 brand — creating a second brand returns 403", async () => {
    // org2 is starter tier (limit: 1 brand)
    const first = await post(
      "/api/brands",
      { name: "First Brand", domain: "first.com.au", vertical: "allied_health" },
      token2,
    );
    expect(first.status).toBe(201);

    const second = await post(
      "/api/brands",
      { name: "Second Brand", domain: "second.com.au", vertical: "allied_health" },
      token2,
    );
    expect(second.status).toBe(403);
    expect((second.body as { error: string }).error).toMatch(/brand limit/i);
  });

  it("§11: Region detection — /au/* routes return x-visibleau-region: au", async () => {
    const { headers } = await getPublic("/au/");
    expect(headers.get("x-visibleau-region")).toBe("au");
  });

  it("§11: Region detection — /uk/* routes return x-visibleau-region: uk", async () => {
    const { headers } = await getPublic("/uk/");
    expect(headers.get("x-visibleau-region")).toBe("uk");
  });

  it("§11: /api/health returns 200 status=ok", async () => {
    const { status, body } = await getPublic("/api/health");
    expect(status).toBe(200);
    expect((body as { status: string }).status).toBe("ok");
  });

  it("§11: Inngest route exists at canonical path /api/webhooks/inngest", async () => {
    // GET must not return 404 (confirms route exists at canonical path)
    const { status } = await request("/api/webhooks/inngest", { method: "GET" });
    expect(status).not.toBe(404);
  });
});
