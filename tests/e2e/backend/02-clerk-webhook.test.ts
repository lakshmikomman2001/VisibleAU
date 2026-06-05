/**
 * tests/e2e/backend/02-clerk-webhook.test.ts
 *
 * E2E: POST /api/webhooks/clerk
 *
 * Tests the full Clerk webhook lifecycle with REAL DB reads to verify
 * that rows are created/deleted correctly.
 *
 * Sprint 1 §6 events covered:
 *   - organization.created  (with publicMetadata.region + tier — Z1 fix)
 *   - organization.deleted  (soft-delete org + cascade soft-delete brands — V2 fix)
 *   - organizationMembership.created
 *   - organizationMembership.deleted  (hard-delete user row — V2 fix)
 *   - user.deleted  (hard-delete user row — V2 fix, GDPR)
 *
 * Security: Sprint 1 webhook handler verifies Svix signatures.
 * Tests use signWebhook() to generate valid signatures.
 * A tampered/missing signature test confirms the 400 guard.
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  getActiveBrandsByOrg,
  getBrandById,
  getOrgByClerkId,
  getUserByClerkId,
  seedBrand,
  seedOrganization,
  seedUser,
  testDb,
  truncateAll,
} from "./helpers/db";
import { postPublic } from "./helpers/http";
import {
  membershipCreatedPayload,
  membershipDeletedPayload,
  orgCreatedPayload,
  orgDeletedPayload,
  orgUpdatedPayload,
  signWebhook,
  userDeletedPayload,
} from "./helpers/svix";

const WEBHOOK_URL = "/api/webhooks/clerk";

// Unique IDs per test run to avoid collision
const mkId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function sendWebhook(payload: Record<string, unknown>, eventType: string) {
  const { rawBody, headers } = signWebhook(payload, eventType);
  return postPublic(WEBHOOK_URL, undefined, headers, rawBody);
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  // ─── Signature verification ────────────────────────────────────────────────

  describe("signature verification", () => {
    it("rejects a request with no Svix headers (400)", async () => {
      const { status } = await postPublic(
        WEBHOOK_URL,
        { type: "organization.created", data: {} },
        { "Content-Type": "application/json" },
      );
      expect(status).toBe(400);
    });

    it("rejects a request with tampered signature (400)", async () => {
      const clerkOrgId = mkId("org");
      const payload = orgCreatedPayload({ clerkOrgId, name: "Tampered Org" });
      const { rawBody, headers } = signWebhook(payload, "organization.created");
      // Corrupt the signature — body is unchanged so we can detect signature-only tamper
      headers["svix-signature"] = "v1,totallywrongsignature==";
      const { status } = await postPublic(WEBHOOK_URL, undefined, headers, rawBody);
      expect(status).toBe(400);
    });
  });

  // ─── organization.updated ─────────────────────────────────────────────────

  describe("organization.updated", () => {
    it("updates the org name in the DB (Sprint 1 §6)", async () => {
      // F5 FIX: organization.updated → update name was listed in Sprint 1 §6
      // but had zero test coverage. svix.ts already had orgUpdatedPayload().
      const clerkOrgId = mkId("org");
      const org = await seedOrganization({ clerkOrgId, name: "Old Name" });

      const payload = orgUpdatedPayload(clerkOrgId, "New Trading Name");
      const { status } = await sendWebhook(payload, "organization.updated");
      expect(status).toBe(200);

      const updated = await getOrgByClerkId(clerkOrgId);
      expect(updated!.name).toBe("New Trading Name");
      // Region and tier must not change on name update
      expect(updated!.region).toBe(org.region);
      expect(updated!.tier).toBe(org.tier);
    });

    it("is idempotent — replaying org.updated twice sets same name", async () => {
      const clerkOrgId = mkId("org");
      await seedOrganization({ clerkOrgId, name: "Idempotent Org" });

      const payload = orgUpdatedPayload(clerkOrgId, "Final Name");
      await sendWebhook(payload, "organization.updated");
      const { status } = await sendWebhook(payload, "organization.updated");
      expect(status).toBe(200);

      const org = await getOrgByClerkId(clerkOrgId);
      expect(org!.name).toBe("Final Name");
    });
  });

  // ─── organization.created ─────────────────────────────────────────────────

  describe("organization.created", () => {
    it("inserts an organizations row with region + tier from publicMetadata", async () => {
      const clerkOrgId = mkId("org");
      const payload = orgCreatedPayload({
        clerkOrgId,
        name: "Bondi Plumbing Co",
        region: "au",
        tier: "starter",
      });

      const { status } = await sendWebhook(payload, "organization.created");
      expect(status).toBe(200);

      const org = await getOrgByClerkId(clerkOrgId);
      expect(org).not.toBeNull();
      expect(org!.name).toBe("Bondi Plumbing Co");
      expect(org!.region).toBe("au");
      expect(org!.tier).toBe("starter");
      expect(org!.deletedAt).toBeNull();
    });

    it("defaults region to au and tier to free when publicMetadata is absent", async () => {
      const clerkOrgId = mkId("org");
      const payload = {
        data: {
          id: clerkOrgId,
          name: "Default Region Org",
          public_metadata: {}, // no region or tier
          created_at: Date.now(),
        },
        type: "organization.created",
      };

      const { status } = await sendWebhook(payload, "organization.created");
      expect(status).toBe(200);

      const org = await getOrgByClerkId(clerkOrgId);
      expect(org!.region).toBe("au");
      expect(org!.tier).toBe("free");
    });

    it("is idempotent — replaying the same event does not duplicate the row", async () => {
      const clerkOrgId = mkId("org");
      const payload = orgCreatedPayload({ clerkOrgId, name: "Idempotent Org" });

      await sendWebhook(payload, "organization.created");
      const { status } = await sendWebhook(payload, "organization.created");
      expect(status).toBe(200);

      const orgs = await testDb
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.clerkOrgId, clerkOrgId));
      expect(orgs).toHaveLength(1);
    });

    it("creates orgs for all valid regions", async () => {
      const regions: Array<"au" | "nz" | "uk" | "us" | "ca" | "eu"> = [
        "au",
        "nz",
        "uk",
        "us",
        "ca",
        "eu",
      ];

      for (const region of regions) {
        const clerkOrgId = mkId(`org_${region}`);
        const payload = orgCreatedPayload({ clerkOrgId, name: `${region} Org`, region });
        const { status } = await sendWebhook(payload, "organization.created");
        expect(status, `Expected 200 for region ${region}`).toBe(200);

        const org = await getOrgByClerkId(clerkOrgId);
        expect(org!.region).toBe(region);
      }
    });
  });

  // ─── organizationMembership.created ───────────────────────────────────────

  describe("organizationMembership.created", () => {
    it("inserts a users row linked to the correct organization", async () => {
      // Pre-seed org (as if organization.created already fired)
      const org = await seedOrganization({
        clerkOrgId: mkId("org"),
        name: "Physio Plus AU",
      });

      const clerkUserId = mkId("user");
      const payload = membershipCreatedPayload({
        clerkUserId,
        clerkOrgId: org.clerkOrgId,
        email: `${clerkUserId}@physio.test`,
        name: "Jacinta Reeve",
      });

      const { status } = await sendWebhook(payload, "organizationMembership.created");
      expect(status).toBe(200);

      const user = await getUserByClerkId(clerkUserId);
      expect(user).not.toBeNull();
      expect(user!.organizationId).toBe(org.id);
      expect(user!.email).toContain("@physio.test");
    });

    it("is idempotent — replaying membership.created does not create duplicate", async () => {
      const org = await seedOrganization({
        clerkOrgId: mkId("org"),
        name: "Idempotent Membership Org",
      });

      const clerkUserId = mkId("user");
      const payload = membershipCreatedPayload({
        clerkUserId,
        clerkOrgId: org.clerkOrgId,
        email: `${clerkUserId}@test.au`,
      });

      await sendWebhook(payload, "organizationMembership.created");
      const { status } = await sendWebhook(payload, "organizationMembership.created");
      expect(status).toBe(200);

      const users = await testDb
        .select()
        .from(schema.users)
        .where(eq(schema.users.clerkUserId, clerkUserId));
      expect(users).toHaveLength(1);
    });
  });

  // ─── organizationMembership.deleted ───────────────────────────────────────

  describe("organizationMembership.deleted", () => {
    it("hard-deletes the users row (not soft-delete — V2 fix)", async () => {
      const org = await seedOrganization({
        clerkOrgId: mkId("org"),
        name: "Membership Delete Org",
      });
      const clerkUserId = mkId("user");
      await seedUser({
        clerkUserId,
        organizationId: org.id,
        email: `${clerkUserId}@test.au`,
      });

      const payload = membershipDeletedPayload(clerkUserId, org.clerkOrgId);
      const { status } = await sendWebhook(payload, "organizationMembership.deleted");
      expect(status).toBe(200);

      const user = await getUserByClerkId(clerkUserId);
      expect(user).toBeNull(); // hard-deleted
    });
  });

  // ─── organization.deleted ─────────────────────────────────────────────────

  describe("organization.deleted", () => {
    it("soft-deletes the org row (sets deletedAt)", async () => {
      const clerkOrgId = mkId("org");
      const org = await seedOrganization({ clerkOrgId, name: "Org To Delete" });

      const { status } = await sendWebhook(orgDeletedPayload(clerkOrgId), "organization.deleted");
      expect(status).toBe(200);

      const [deletedOrg] = await testDb
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, org.id));

      expect(deletedOrg.deletedAt).not.toBeNull();
    });

    it("cascade soft-deletes all brands belonging to the org (V2 fix)", async () => {
      const clerkOrgId = mkId("org");
      const org = await seedOrganization({ clerkOrgId, name: "Org With Brands" });

      const brand1 = await seedBrand({
        organizationId: org.id,
        name: "Brand A",
        domain: "brand-a.com.au",
      });
      const brand2 = await seedBrand({
        organizationId: org.id,
        name: "Brand B",
        domain: "brand-b.com.au",
      });

      const { status } = await sendWebhook(orgDeletedPayload(clerkOrgId), "organization.deleted");
      expect(status).toBe(200);

      const b1 = await getBrandById(brand1.id);
      const b2 = await getBrandById(brand2.id);

      expect(b1!.deletedAt).not.toBeNull();
      expect(b2!.deletedAt).not.toBeNull();

      // Active brands list should be empty
      const active = await getActiveBrandsByOrg(org.id);
      expect(active).toHaveLength(0);
    });
  });

  // ─── user.deleted ─────────────────────────────────────────────────────────

  describe("user.deleted", () => {
    it("hard-deletes the users row by clerkUserId (GDPR — V2 fix)", async () => {
      const org = await seedOrganization({
        clerkOrgId: mkId("org"),
        name: "GDPR Delete Org",
      });
      const clerkUserId = mkId("user");
      await seedUser({
        clerkUserId,
        organizationId: org.id,
        email: `${clerkUserId}@gdpr.test`,
      });

      const { status } = await sendWebhook(userDeletedPayload(clerkUserId), "user.deleted");
      expect(status).toBe(200);

      const user = await getUserByClerkId(clerkUserId);
      expect(user).toBeNull();
    });
  });
});
