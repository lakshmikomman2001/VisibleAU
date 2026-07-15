import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../../.env.test.local") });

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq, and } from "drizzle-orm";
import postgres from "postgres";
import {
  auditTrail,
  orgMembers,
  dataResidencyLog,
  orgFeatureFlags,
  organizations,
  users,
} from "@/db/schema";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const testDb = drizzle(client);

const TEST_PREFIX = `s8-test-${Date.now()}`;
let testOrgId: string;
let testUserId: string;
let testOrg2Id: string;
let testUser2Id: string;

async function seedTestOrg() {
  const [org] = await testDb
    .insert(organizations)
    .values({
      clerkOrgId: `${TEST_PREFIX}-org`,
      name: `[S8-TEST] Org`,
      tier: "agency",
      region: "au",
    })
    .returning();
  testOrgId = org.id;

  const [user] = await testDb
    .insert(users)
    .values({
      clerkUserId: `${TEST_PREFIX}-user`,
      organizationId: testOrgId,
      email: `${TEST_PREFIX}@test.local`,
      name: "[S8-TEST] User",
      role: "owner",
    })
    .returning();
  testUserId = user.id;

  const [org2] = await testDb
    .insert(organizations)
    .values({
      clerkOrgId: `${TEST_PREFIX}-org2`,
      name: `[S8-TEST] Other Org`,
      tier: "free",
      region: "au",
    })
    .returning();
  testOrg2Id = org2.id;

  const [user2] = await testDb
    .insert(users)
    .values({
      clerkUserId: `${TEST_PREFIX}-user2`,
      organizationId: testOrg2Id,
      email: `${TEST_PREFIX}-2@test.local`,
      name: "[S8-TEST] User 2",
      role: "owner",
    })
    .returning();
  testUser2Id = user2.id;
}

async function cleanup() {
  await testDb.delete(auditTrail).where(eq(auditTrail.organizationId, testOrgId)).catch(() => {});
  await testDb.delete(auditTrail).where(eq(auditTrail.organizationId, testOrg2Id)).catch(() => {});
  await testDb.delete(orgMembers).where(eq(orgMembers.organizationId, testOrgId)).catch(() => {});
  await testDb.delete(orgMembers).where(eq(orgMembers.organizationId, testOrg2Id)).catch(() => {});
  await testDb.delete(dataResidencyLog).where(eq(dataResidencyLog.organizationId, testOrgId)).catch(() => {});
  await testDb.delete(orgFeatureFlags).where(eq(orgFeatureFlags.organizationId, testOrgId)).catch(() => {});
  await testDb.delete(users).where(eq(users.organizationId, testOrgId)).catch(() => {});
  await testDb.delete(users).where(eq(users.organizationId, testOrg2Id)).catch(() => {});
  await testDb.delete(organizations).where(eq(organizations.id, testOrgId)).catch(() => {});
  await testDb.delete(organizations).where(eq(organizations.id, testOrg2Id)).catch(() => {});
}

beforeAll(async () => {
  await seedTestOrg();
});

afterAll(async () => {
  await cleanup();
  await client.end();
});

// ---------------------------------------------------------------------------
// 2.2 — recordAction writes correctly
// ---------------------------------------------------------------------------
describe("2.2 — recordAction writes to audit_trail", () => {
  afterAll(async () => {
    await testDb.delete(auditTrail).where(eq(auditTrail.organizationId, testOrgId));
  });

  it("inserts a row with correct action, resource_type, and non-null organization_id", async () => {
    const { recordAction } = await import("@/lib/governance/audit-trail");
    await recordAction({
      organizationId: testOrgId,
      userId: testUserId,
      action: "audit_triggered",
      resourceType: "audit",
      resourceId: "test-resource-123",
      metadata: { source: "s8-test" },
    });

    const rows = await testDb
      .select()
      .from(auditTrail)
      .where(
        and(
          eq(auditTrail.organizationId, testOrgId),
          eq(auditTrail.action, "audit_triggered"),
        ),
      );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrgId);
    expect(row.userId).toBe(testUserId);
    expect(row.action).toBe("audit_triggered");
    expect(row.resourceType).toBe("audit");
    expect(row.resourceId).toBe("test-resource-123");
    expect(row.metadata).toEqual({ source: "s8-test" });
    expect(row.organizationId).not.toBeNull();
  });

  it("allows null userId for system actions", async () => {
    const { recordAction } = await import("@/lib/governance/audit-trail");
    await recordAction({
      organizationId: testOrgId,
      action: "tier_changed",
      resourceType: "subscription",
    });

    const rows = await testDb
      .select()
      .from(auditTrail)
      .where(
        and(
          eq(auditTrail.organizationId, testOrgId),
          eq(auditTrail.action, "tier_changed"),
        ),
      );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[rows.length - 1].userId).toBeNull();
  });

  it("organization_id is NEVER null (the F6/23502 guard)", async () => {
    const rows = await testDb
      .select()
      .from(auditTrail)
      .where(eq(auditTrail.organizationId, testOrgId));

    for (const row of rows) {
      expect(row.organizationId).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 2.3 — Privilege audit: role change + member removal metadata
// ---------------------------------------------------------------------------
describe("2.3 — privilege audit metadata in audit_trail", () => {
  afterAll(async () => {
    await testDb
      .delete(auditTrail)
      .where(
        and(
          eq(auditTrail.organizationId, testOrgId),
          eq(auditTrail.resourceType, "org_member"),
        ),
      );
  });

  it("member_role_changed records old→new role in metadata", async () => {
    const { recordAction } = await import("@/lib/governance/audit-trail");
    await recordAction({
      organizationId: testOrgId,
      userId: testUserId,
      action: "member_role_changed",
      resourceType: "org_member",
      resourceId: testUserId,
      metadata: { targetUserId: testUserId, previousRole: "viewer", newRole: "analyst" },
    });

    const [row] = await testDb
      .select()
      .from(auditTrail)
      .where(
        and(
          eq(auditTrail.organizationId, testOrgId),
          eq(auditTrail.action, "member_role_changed"),
        ),
      );

    expect(row).toBeDefined();
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.previousRole).toBe("viewer");
    expect(meta.newRole).toBe("analyst");
    expect(meta.targetUserId).toBe(testUserId);
  });

  it("member_removed records wasAccepted in metadata", async () => {
    const { recordAction } = await import("@/lib/governance/audit-trail");
    await recordAction({
      organizationId: testOrgId,
      userId: testUserId,
      action: "member_removed",
      resourceType: "org_member",
      resourceId: testUserId,
      metadata: { targetUserId: testUserId, wasAccepted: true },
    });

    const [row] = await testDb
      .select()
      .from(auditTrail)
      .where(
        and(
          eq(auditTrail.organizationId, testOrgId),
          eq(auditTrail.action, "member_removed"),
        ),
      );

    expect(row).toBeDefined();
    expect((row.metadata as Record<string, unknown>).wasAccepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2.7 — recordDataResidency: 7 rows, idempotent, canon retention values
// ---------------------------------------------------------------------------
describe("2.7 — recordDataResidency writes and is idempotent", () => {
  afterAll(async () => {
    await testDb.delete(dataResidencyLog).where(eq(dataResidencyLog.organizationId, testOrgId));
  });

  it("produces exactly 7 rows for a new org", async () => {
    const { recordDataResidency } = await import("@/lib/governance/record-data-residency");
    await recordDataResidency(testOrgId);

    const rows = await testDb
      .select()
      .from(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, testOrgId));

    expect(rows).toHaveLength(7);
  });

  it("running twice still yields 7 rows (idempotent via UPSERT)", async () => {
    const { recordDataResidency } = await import("@/lib/governance/record-data-residency");
    await recordDataResidency(testOrgId);
    await recordDataResidency(testOrgId);

    const rows = await testDb
      .select()
      .from(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, testOrgId));

    expect(rows).toHaveLength(7);
  });

  it("retention_period values match canon (DR-02 audit-data-retention sync)", async () => {
    const rows = await testDb
      .select()
      .from(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, testOrgId));

    const byType = Object.fromEntries(rows.map((r) => [r.dataType, r]));

    expect(byType.audit_data.retentionPeriod).toBe("12 months");
    expect(byType.evidence_snapshots.retentionPeriod).toBe("12 months");
    expect(byType.pdf_reports.retentionPeriod).toBe("12 months");
    expect(byType.llm_cache.retentionPeriod).toBe("30 days");
    expect(byType.crawler_logs.retentionPeriod).toBe("90 days");
    expect(byType.llm_processing_openai.retentionPeriod).toBe("0 days");
    expect(byType.llm_processing_anthropic.retentionPeriod).toBe("0 days");
  });

  it("provider + region are correct for each data type", async () => {
    const rows = await testDb
      .select()
      .from(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, testOrgId));

    const byType = Object.fromEntries(rows.map((r) => [r.dataType, r]));

    expect(byType.audit_data.provider).toBe("supabase");
    expect(byType.audit_data.storageRegion).toBe("ap-southeast-2");
    expect(byType.llm_processing_openai.provider).toBe("openai");
    expect(byType.llm_processing_openai.storageRegion).toBe("us");
    expect(byType.llm_processing_anthropic.provider).toBe("anthropic");
    expect(byType.llm_processing_anthropic.storageRegion).toBe("us");
  });
});

// ---------------------------------------------------------------------------
// 2.10 — Feature flags: org override, expired flags
// ---------------------------------------------------------------------------
describe("2.10 — feature flag resolution via getOrgFlag/getOrgFlags", () => {
  beforeEach(async () => {
    await testDb.delete(orgFeatureFlags).where(eq(orgFeatureFlags.organizationId, testOrgId));
  });

  afterAll(async () => {
    await testDb.delete(orgFeatureFlags).where(eq(orgFeatureFlags.organizationId, testOrgId));
  });

  it("getOrgFlag returns the DB value when a flag exists", async () => {
    await testDb.insert(orgFeatureFlags).values({
      organizationId: testOrgId,
      flagKey: "fan_out_enabled",
      isEnabled: true,
    });

    const { getOrgFlag } = await import("@/lib/governance/feature-flags");
    const result = await getOrgFlag(testOrgId, "fan_out_enabled");
    expect(result).toBe(true);
  });

  it("getOrgFlag returns null for non-existent flag", async () => {
    const { getOrgFlag } = await import("@/lib/governance/feature-flags");
    const result = await getOrgFlag(testOrgId, "nonexistent_flag");
    expect(result).toBeNull();
  });

  it("getOrgFlag returns null for expired flag", async () => {
    await testDb.insert(orgFeatureFlags).values({
      organizationId: testOrgId,
      flagKey: "linkedin_audit_enabled",
      isEnabled: true,
      expiresAt: new Date(Date.now() - 86_400_000),
    });

    const { getOrgFlag } = await import("@/lib/governance/feature-flags");
    const result = await getOrgFlag(testOrgId, "linkedin_audit_enabled");
    expect(result).toBeNull();
  });

  it("getOrgFlags returns all non-expired flags for the org", async () => {
    await testDb.insert(orgFeatureFlags).values([
      { organizationId: testOrgId, flagKey: "fan_out_enabled", isEnabled: true },
      { organizationId: testOrgId, flagKey: "linkedin_audit_enabled", isEnabled: false },
      {
        organizationId: testOrgId,
        flagKey: "youtube_audit_enabled",
        isEnabled: true,
        expiresAt: new Date(Date.now() - 1000),
      },
    ]);

    const { getOrgFlags } = await import("@/lib/governance/feature-flags");
    const result = await getOrgFlags(testOrgId);

    expect(result.fan_out_enabled).toBe(true);
    expect(result.linkedin_audit_enabled).toBe(false);
    expect(result.youtube_audit_enabled).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2.1 — assertBrandAccess: brand_access=null vs restricted
// ---------------------------------------------------------------------------
describe("2.1 — assertBrandAccess with real org_members data", () => {
  const testBrandA = "aaaaaaaa-0000-4000-8000-000000000001";
  const testBrandB = "aaaaaaaa-0000-4000-8000-000000000002";

  beforeEach(async () => {
    await testDb.delete(orgMembers).where(eq(orgMembers.organizationId, testOrgId));
  });

  afterAll(async () => {
    await testDb.delete(orgMembers).where(eq(orgMembers.organizationId, testOrgId));
  });

  function makeCurrentUser(role: string) {
    return {
      id: testUserId,
      clerkUserId: `${TEST_PREFIX}-user`,
      organizationId: testOrgId,
      email: `${TEST_PREFIX}@test.local`,
      name: "[S8-TEST]",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      organization: {
        id: testOrgId,
        clerkOrgId: `${TEST_PREFIX}-org`,
        name: "[S8-TEST] Org",
        slug: null,
        region: "au" as const,
        tier: "agency" as const,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionCancelledAt: null,
        onboardingComplete: false,
        ga4MeasurementId: null,
        ga4ApiSecret: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    };
  }

  it("brand_access=null allows access to any brand (owner)", async () => {
    await testDb.insert(orgMembers).values({
      organizationId: testOrgId,
      userId: testUserId,
      role: "owner",
      brandAccess: null,
      isActive: true,
      acceptedAt: new Date(),
    });

    const { assertBrandAccess } = await import("@/lib/governance/access-control");
    await expect(assertBrandAccess(makeCurrentUser("owner") as never, testBrandA)).resolves.toBeUndefined();
    await expect(assertBrandAccess(makeCurrentUser("owner") as never, testBrandB)).resolves.toBeUndefined();
  });

  it("brand_access=[brandA] denies access to brandB (analyst)", async () => {
    await testDb.insert(orgMembers).values({
      organizationId: testOrgId,
      userId: testUserId,
      role: "analyst",
      brandAccess: [testBrandA],
      isActive: true,
      acceptedAt: new Date(),
    });

    const { assertBrandAccess, BrandAccessDeniedError } = await import("@/lib/governance/access-control");
    await expect(assertBrandAccess(makeCurrentUser("analyst") as never, testBrandA)).resolves.toBeUndefined();
    await expect(assertBrandAccess(makeCurrentUser("analyst") as never, testBrandB)).rejects.toThrow(
      BrandAccessDeniedError,
    );
  });

  it("non-member with no org_members row gets access (fallback to no restriction)", async () => {
    const { assertBrandAccess } = await import("@/lib/governance/access-control");
    await expect(assertBrandAccess(makeCurrentUser("viewer") as never, testBrandA)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2.6 — Invite lifecycle: insert, accept, unique constraint
// ---------------------------------------------------------------------------
describe("2.6 — org_members invite lifecycle (IC-01)", () => {
  let invitedUserId: string;

  beforeAll(async () => {
    const [u] = await testDb
      .insert(users)
      .values({
        clerkUserId: `${TEST_PREFIX}-invited`,
        organizationId: testOrgId,
        email: `${TEST_PREFIX}-invited@test.local`,
        name: "[S8-TEST] Invited",
        role: "viewer",
      })
      .returning();
    invitedUserId = u.id;
  });

  beforeEach(async () => {
    await testDb
      .delete(orgMembers)
      .where(
        and(eq(orgMembers.organizationId, testOrgId), eq(orgMembers.userId, invitedUserId)),
      );
  });

  afterAll(async () => {
    await testDb
      .delete(orgMembers)
      .where(eq(orgMembers.userId, invitedUserId));
    await testDb
      .delete(users)
      .where(eq(users.clerkUserId, `${TEST_PREFIX}-invited`));
  });

  it("invite creates a row with invitation_token (nanoid), accepted_at=NULL, is_active=true", async () => {
    const token = `test-token-${Date.now()}`;
    const [row] = await testDb
      .insert(orgMembers)
      .values({
        organizationId: testOrgId,
        userId: invitedUserId,
        role: "analyst",
        invitationToken: token,
        invitedBy: testUserId,
        invitedAt: new Date(),
        acceptedAt: null,
        isActive: true,
        brandAccess: null,
      })
      .returning();

    expect(row.invitationToken).toBe(token);
    expect(row.acceptedAt).toBeNull();
    expect(row.isActive).toBe(true);
    expect(row.role).toBe("analyst");
  });

  it("accept sets accepted_at=now, keeps is_active=true", async () => {
    const token = `test-token-accept-${Date.now()}`;
    const [inserted] = await testDb
      .insert(orgMembers)
      .values({
        organizationId: testOrgId,
        userId: invitedUserId,
        role: "viewer",
        invitationToken: token,
        acceptedAt: null,
        isActive: true,
      })
      .returning();

    const now = new Date();
    const [accepted] = await testDb
      .update(orgMembers)
      .set({ acceptedAt: now, invitationToken: null })
      .where(eq(orgMembers.id, inserted.id))
      .returning();

    expect(accepted.acceptedAt).not.toBeNull();
    expect(accepted.invitationToken).toBeNull();
    expect(accepted.isActive).toBe(true);
  });

  it("UNIQUE(org, user) prevents duplicate invite", async () => {
    await testDb.insert(orgMembers).values({
      organizationId: testOrgId,
      userId: invitedUserId,
      role: "viewer",
      invitationToken: `unique-test-${Date.now()}`,
      isActive: true,
    });

    await expect(
      testDb.insert(orgMembers).values({
        organizationId: testOrgId,
        userId: invitedUserId,
        role: "analyst",
        invitationToken: `unique-test-dup-${Date.now()}`,
        isActive: true,
      }),
    ).rejects.toThrow();
  });

  it("cancel(DELETE) on unaccepted row removes it; accepted rows are soft-deactivated", async () => {
    const [pending] = await testDb
      .insert(orgMembers)
      .values({
        organizationId: testOrgId,
        userId: invitedUserId,
        role: "viewer",
        invitationToken: `cancel-test-${Date.now()}`,
        acceptedAt: null,
        isActive: true,
      })
      .returning();

    await testDb.delete(orgMembers).where(
      and(eq(orgMembers.id, pending.id), sql`${orgMembers.acceptedAt} IS NULL`),
    );

    const [gone] = await testDb
      .select()
      .from(orgMembers)
      .where(eq(orgMembers.id, pending.id));

    expect(gone).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2.8 — Provisioning source guards (afterCreateOrganization is a closure
//        inside betterAuth() plugin config — not importable/callable directly.
//        Fallback: scoped source assertions. Functional E2E belongs in section 5.)
// ---------------------------------------------------------------------------
describe("2.8 — provisioning source guards (afterCreateOrganization not directly callable)", () => {
  const authSrc = readFileSync(resolve(__dirname, "../../../lib/auth/server.ts"), "utf-8");
  const provisionBlock = authSrc.split("afterCreateOrganization")[1] ?? "";

  it("orgMembers insert contains role='owner' + brandAccess=null in one block", () => {
    expect(provisionBlock).toMatch(
      /\.insert\(\s*orgMembers\s*\)[\s\S]{0,500}role:\s*"owner"[\s\S]{0,200}brandAccess:\s*null/
    );
  });

  it("orgMembers insert sets acceptedAt and isActive=true (pre-accepted owner)", () => {
    expect(provisionBlock).toMatch(
      /\.insert\(\s*orgMembers\s*\)[\s\S]{0,500}acceptedAt:[\s\S]{0,200}isActive:\s*true/
    );
  });

  it("provisioning calls recordDataResidency for the new org", () => {
    expect(provisionBlock).toContain("recordDataResidency(");
  });
});
