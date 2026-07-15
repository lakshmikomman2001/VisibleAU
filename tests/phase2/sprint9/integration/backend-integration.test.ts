/**
 * S9 TEST TRACK — SECTION 2: BACKEND INTEGRATION
 *
 * Tests routes + guards against REAL dev DB (visibleau).
 * Sections: 2.1 Envelope Shapes, 2.2 Brand Isolation, 2.3 Tier Gates,
 *           2.4 Tracker Query, 2.5 Health Check Sources, 2.6 #1 Action
 *
 * ⚠️ = break-proof test (reintroducing the bug causes RED)
 */
import { afterAll, beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import postgres from "postgres";
import { readFileSync } from "fs";
import path from "path";

// ─── mock auth BEFORE any route import ───
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
// Mock getMemberRecord so assertBrandAccess works without real org_members rows
vi.mock("@/lib/governance/access-control", async (importOriginal) => {
  const orig = await importOriginal() as Record<string, unknown>;
  return {
    ...orig,
    getMemberRecord: vi.fn().mockResolvedValue({ role: "owner", brandAccess: null }),
  };
});

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

let client: ReturnType<typeof postgres>;
let mockGetCurrentUser: ReturnType<typeof vi.fn>;
let mockGetMemberRecord: ReturnType<typeof vi.fn>;

// Route handlers
let getLatestAudit: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getTopicalGaps: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getTasks: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getDrafts: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getAgentReadiness: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getSiteReadiness: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getJourneys: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getComparisons: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getBrand: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let getActionProgress: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let postTasks: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;
let postDrafts: (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>;

const CLEANUP = {
  orgIds: [] as string[],
  userIds: [] as string[],
  memberIds: [] as string[],
  brandIds: [] as string[],
  auditIds: [] as string[],
  technicalAuditIds: [] as string[],
  taskIds: [] as string[],
  gapIds: [] as string[],
  subscriptionIds: [] as string[],
  agentReadinessIds: [] as string[],
};

let orgAId: string;
let orgBId: string;
let orgABrandId: string;
let orgBBrandId: string;
let orgASaasBrandId: string;
let orgAUserId: string;
let orgBUserId: string;
let orgAAuditId: string;

function makeReq(urlPath: string): Request {
  return new Request(`http://localhost:3000${urlPath}`);
}
function makeParams(brandId: string) {
  return { params: Promise.resolve({ brandId }) };
}

function setAuthAs(orgId: string, userId?: string, role?: string) {
  mockGetCurrentUser.mockResolvedValue({
    id: userId ?? orgAUserId,
    organizationId: orgId,
    organization: { id: orgId },
    role: role ?? "owner",
  });
}
function clearAuth() {
  mockGetCurrentUser.mockResolvedValue(null);
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;

  client = postgres(TEST_DB_URL, { max: 1 });

  // ── seed org A ──
  const [orgA] = await client`
    INSERT INTO organizations (clerk_org_id, name, region, tier, metadata)
    VALUES ('s9int_org_a', 'S9-INT Org A', 'au', 'free', '{}')
    RETURNING id
  `;
  orgAId = orgA.id;
  CLEANUP.orgIds.push(orgAId);

  // ── seed org B ──
  const [orgB] = await client`
    INSERT INTO organizations (clerk_org_id, name, region, tier, metadata)
    VALUES ('s9int_org_b', 'S9-INT Org B', 'au', 'free', '{}')
    RETURNING id
  `;
  orgBId = orgB.id;
  CLEANUP.orgIds.push(orgBId);

  // ── seed user A ──
  const [userA] = await client`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES ('s9int_user_a', ${orgAId}, 's9int-a@test.local', 'Test User A', 'owner')
    RETURNING id
  `;
  orgAUserId = userA.id;
  CLEANUP.userIds.push(orgAUserId);

  // ── seed user B ──
  const [userB] = await client`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES ('s9int_user_b', ${orgBId}, 's9int-b@test.local', 'Test User B', 'owner')
    RETURNING id
  `;
  orgBUserId = userB.id;
  CLEANUP.userIds.push(orgBUserId);

  // ── seed org_members ──
  const [memA] = await client`
    INSERT INTO org_members (organization_id, user_id, role, is_active)
    VALUES (${orgAId}, ${orgAUserId}, 'owner', true)
    RETURNING id
  `;
  CLEANUP.memberIds.push(memA.id);
  const [memB] = await client`
    INSERT INTO org_members (organization_id, user_id, role, is_active)
    VALUES (${orgBId}, ${orgBUserId}, 'owner', true)
    RETURNING id
  `;
  CLEANUP.memberIds.push(memB.id);

  // Dynamic import route handlers
  const [
    latestAuditR, topicalGapsR, tasksR, draftsR,
    agentReadinessR, siteReadinessR, journeysR,
    comparisonsR, brandR, actionProgressR, authR, accessR,
  ] = await Promise.all([
    import("@/app/api/brands/[brandId]/latest-audit/route"),
    import("@/app/api/brands/[brandId]/topical-gaps/route"),
    import("@/app/api/brands/[brandId]/tasks/route"),
    import("@/app/api/brands/[brandId]/drafts/route"),
    import("@/app/api/brands/[brandId]/agent-readiness/route"),
    import("@/app/api/brands/[brandId]/site-readiness/route"),
    import("@/app/api/brands/[brandId]/journeys/route"),
    import("@/app/api/brands/[brandId]/comparisons/route"),
    import("@/app/api/brands/[brandId]/route"),
    import("@/app/api/brands/[brandId]/action-progress/route"),
    import("@/lib/auth/current-user"),
    import("@/lib/governance/access-control"),
  ]);

  getLatestAudit = latestAuditR.GET;
  getTopicalGaps = topicalGapsR.GET;
  getTasks = tasksR.GET;
  getDrafts = draftsR.GET;
  getAgentReadiness = agentReadinessR.GET;
  getSiteReadiness = siteReadinessR.GET;
  getJourneys = journeysR.GET;
  getComparisons = comparisonsR.GET;
  getBrand = brandR.GET;
  getActionProgress = actionProgressR.GET;
  postTasks = tasksR.POST;
  postDrafts = draftsR.POST;
  mockGetCurrentUser = authR.getCurrentUser as ReturnType<typeof vi.fn>;
  mockGetMemberRecord = accessR.getMemberRecord as ReturnType<typeof vi.fn>;

  // ── seed org A brand (tradies, non-SaaS) ──
  const [brandA] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${orgAId}, 'S9-INT-Bondi', 's9int-bondi.example.com', 'tradies', 'au', ARRAY['NSW:Bondi'])
    RETURNING id
  `;
  orgABrandId = brandA.id;
  CLEANUP.brandIds.push(orgABrandId);

  // ── seed org A SaaS brand ──
  const [brandSaas] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region)
    VALUES (${orgAId}, 'S9-INT-SaaS', 's9int-saas.example.com', 'saas', 'au')
    RETURNING id
  `;
  orgASaasBrandId = brandSaas.id;
  CLEANUP.brandIds.push(orgASaasBrandId);

  // ── seed org B brand ──
  const [brandB] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region)
    VALUES (${orgBId}, 'S9-INT-OrgB', 's9int-orgb.example.com', 'tradies', 'au')
    RETURNING id
  `;
  orgBBrandId = brandB.id;
  CLEANUP.brandIds.push(orgBBrandId);

  // ── seed audit for org A brand (Bondi answer key: Sentiment 50, Frequency 0) ──
  const [auditA] = await client`
    INSERT INTO audits (brand_id, organization_id, audit_number, engines, status, completed_at,
      score_sentiment_numeric, score_frequency, score_composite, prompts_count)
    VALUES (${orgABrandId}, ${orgAId}, 99901, ARRAY['chatgpt','perplexity'], 'complete', NOW() - interval '1 day',
      50.00, 0.00, 23.67, 15)
    RETURNING id
  `;
  orgAAuditId = auditA.id;
  CLEANUP.auditIds.push(orgAAuditId);

  // ── seed technical audit (site readiness = 21) — DIFFERENT from audits.scoreComposite ──
  const [techAudit] = await client`
    INSERT INTO technical_audits (brand_id, organization_id, audit_id, score_composite, score_robots,
      score_llms_txt, score_schema, score_meta, score_content, score_brand_entity, score_signals, score_ai_discovery)
    VALUES (${orgABrandId}, ${orgAId}, ${orgAAuditId}, 21.00,
      50, 30, 40, 20, 10, 15, 25, 35)
    RETURNING id
  `;
  CLEANUP.technicalAuditIds.push(techAudit.id);

  // ── seed agent readiness (local authority = 20) ──
  const [agentScore] = await client`
    INSERT INTO agent_readiness_scores (brand_id, organization_id, scored_at, local_ai_trust_score, total_score)
    VALUES (${orgABrandId}, ${orgAId}, NOW(), 20.00, 45.00)
    RETURNING id
  `;
  CLEANUP.agentReadinessIds.push(agentScore.id);

  // ── seed topical gap ──
  const [gap] = await client`
    INSERT INTO topical_coverage_gaps (brand_id, organization_id, vertical, topic_cluster,
      topic_label, brand_has_content, cross_prompt_impact)
    VALUES (${orgABrandId}, ${orgAId}, 'tradies', 'plumbing_emergency',
      'Emergency Plumbing', false, 8)
    RETURNING id
  `;
  CLEANUP.gapIds.push(gap.id);

  // ── seed remediation task (open, priority 5000) — the #1 action ──
  const [task1] = await client`
    INSERT INTO remediation_tasks (organization_id, brand_id, title, description, status, priority)
    VALUES (${orgAId}, ${orgABrandId}, 'Update local directory listings', NULL, 'open', 5000)
    RETURNING id
  `;
  CLEANUP.taskIds.push(task1.id);

  // ── seed a completed task for this month (for tracker) ──
  const [task2] = await client`
    INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority,
      completed_at, score_after, lift_achieved)
    VALUES (${orgAId}, ${orgABrandId}, 'Fix schema markup', 'complete', 3000,
      NOW(), 72.50, 8.50)
    RETURNING id
  `;
  CLEANUP.taskIds.push(task2.id);

  // ── seed a task completed_at in June UTC but July AEST (the boundary bug) ──
  const [task3] = await client`
    INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority,
      completed_at, score_after, lift_achieved)
    VALUES (${orgAId}, ${orgABrandId}, 'AEST boundary task', 'complete', 4000,
      '2026-06-30 23:00:00+00', 50.00, 5.00)
    RETURNING id
  `;
  CLEANUP.taskIds.push(task3.id);

  // ── seed a task with updated_at this month but completed_at LAST month (F1) ──
  const [task4] = await client`
    INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority,
      completed_at, updated_at, score_after, lift_achieved)
    VALUES (${orgAId}, ${orgABrandId}, 'F1 updated-at trap', 'complete', 4500,
      '2026-06-15 12:00:00+00', NOW(), 60.00, 3.00)
    RETURNING id
  `;
  CLEANUP.taskIds.push(task4.id);

  // ── seed a task with status='completed' (wrong spelling — canon footgun) ──
  const [task5] = await client`
    INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority,
      completed_at)
    VALUES (${orgAId}, ${orgABrandId}, 'Wrong status spelling', 'completed', 4600,
      NOW())
    RETURNING id
  `;
  CLEANUP.taskIds.push(task5.id);

}, 30000);

afterAll(async () => {
  for (const id of CLEANUP.taskIds)
    await client`DELETE FROM remediation_tasks WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.gapIds)
    await client`DELETE FROM topical_coverage_gaps WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.agentReadinessIds)
    await client`DELETE FROM agent_readiness_scores WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.technicalAuditIds)
    await client`DELETE FROM technical_audits WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.subscriptionIds)
    await client`DELETE FROM subscriptions WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.auditIds)
    await client`DELETE FROM audits WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.brandIds)
    await client`DELETE FROM brands WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.memberIds)
    await client`DELETE FROM org_members WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.userIds)
    await client`DELETE FROM users WHERE id = ${id}`.catch(() => {});
  for (const id of CLEANUP.orgIds)
    await client`DELETE FROM organizations WHERE id = ${id}`.catch(() => {});
  await client.end();
}, 15000);

// ═══════════════════════════════════════════════════════════
// §2.1 — ENVELOPE SHAPES
// ═══════════════════════════════════════════════════════════

describe("§2.1 — Envelope Shapes (response contract freeze)", () => {
  beforeAll(async () => {
    setAuthAs(orgAId);
    // Seed growth subscription so Growth+ routes pass tier gates
    await client`DELETE FROM subscriptions WHERE organization_id = ${orgAId}`.catch(() => {});
    const [sub] = await client`
      INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
        stripe_customer_id, stripe_subscription_id, stripe_price_id)
      VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_s21_cus', 's9int_s21_sub', 's9int_s21_price')
      RETURNING id
    `;
    CLEANUP.subscriptionIds.push(sub.id);
  });
  afterAll(async () => {
    await client`DELETE FROM subscriptions WHERE organization_id = ${orgAId}`.catch(() => {});
  });

  describe("/latest-audit → { audit, actionItems, priorAudit, engineStats }", () => {
    it("returns object with exactly the 4 named keys", async () => {
      setAuthAs(orgAId);
      const res = await getLatestAudit(
        makeReq(`/api/brands/${orgABrandId}/latest-audit`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("audit");
      expect(body).toHaveProperty("actionItems");
      expect(body).toHaveProperty("priorAudit");
      expect(body).toHaveProperty("engineStats");
      expect(Array.isArray(body)).toBe(false);
    });

    it("⚠️ promptsCount IS in the SELECT — non-null for seeded brand (F15)", async () => {
      setAuthAs(orgAId);
      const res = await getLatestAudit(
        makeReq(`/api/brands/${orgABrandId}/latest-audit`),
        makeParams(orgABrandId),
      );
      const body = await res.json();
      expect(body.audit).not.toBeNull();
      expect(body.audit.promptsCount).toBeDefined();
      expect(body.audit.promptsCount).not.toBeNull();
      expect(body.audit.promptsCount).toBe(15);
    });
  });

  describe("/brands/{id} → { brand }", () => {
    it("returns object with named 'brand' key", async () => {
      setAuthAs(orgAId);
      const res = await getBrand(
        makeReq(`/api/brands/${orgABrandId}`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("brand");
      expect(Array.isArray(body)).toBe(false);
    });
  });

  describe("/topical-gaps → { gaps }", () => {
    it("returns object with named 'gaps' key (never bare array)", async () => {
      setAuthAs(orgAId);
      const res = await getTopicalGaps(
        makeReq(`/api/brands/${orgABrandId}/topical-gaps`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("gaps");
      expect(Array.isArray(body)).toBe(false);
      expect(Array.isArray(body.gaps)).toBe(true);
    });
  });

  describe("/agent-readiness → { latest, history, llmstxtDepthScore }", () => {
    it("returns object with named keys", async () => {
      setAuthAs(orgAId);
      const res = await getAgentReadiness(
        makeReq(`/api/brands/${orgABrandId}/agent-readiness`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("latest");
      expect(body).toHaveProperty("history");
      expect(body).toHaveProperty("llmstxtDepthScore");
      expect(Array.isArray(body)).toBe(false);
    });
  });

  describe("/site-readiness → { scoreComposite }", () => {
    it("returns object with named 'scoreComposite' key", async () => {
      setAuthAs(orgAId);
      const res = await getSiteReadiness(
        makeReq(`/api/brands/${orgABrandId}/site-readiness`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("scoreComposite");
      expect(Array.isArray(body)).toBe(false);
    });
  });

  describe("/tasks → bare array", () => {
    it("returns a bare array (no named envelope)", async () => {
      setAuthAs(orgAId);
      const res = await getTasks(
        makeReq(`/api/brands/${orgABrandId}/tasks`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("/drafts → bare array", () => {
    it("returns a bare array (no named envelope)", async () => {
      setAuthAs(orgAId);
      const res = await getDrafts(
        makeReq(`/api/brands/${orgABrandId}/drafts`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("⚠️ BREAK-PROOF: envelope route must never return bare array", () => {
    it("topical-gaps body.gaps is array but body itself is NOT array", async () => {
      setAuthAs(orgAId);
      const res = await getTopicalGaps(
        makeReq(`/api/brands/${orgABrandId}/topical-gaps`),
        makeParams(orgABrandId),
      );
      const body = await res.json();
      expect(Array.isArray(body)).toBe(false);
      expect(body.gaps).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════
// §2.2 — BRAND ISOLATION (assertBrandAccess)
// ═══════════════════════════════════════════════════════════

describe("§2.2 — Brand Isolation (cross-org → 403/404, zero leak)", () => {
  describe("cross-org access → denied with no data leak", () => {
    it("⚠️ latest-audit: org B user requesting org A brand → denied", async () => {
      // Restrict brand access to orgB's own brands only
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: [orgBBrandId] });
      setAuthAs(orgBId, orgBUserId);
      const res = await getLatestAudit(
        makeReq(`/api/brands/${orgABrandId}/latest-audit`),
        makeParams(orgABrandId),
      );
      expect([403, 404]).toContain(res.status);
      // Restore
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: null });
    });

    it("⚠️ topical-gaps: org B user requesting org A brand → denied", async () => {
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: [orgBBrandId] });
      setAuthAs(orgBId, orgBUserId);
      const res = await getTopicalGaps(
        makeReq(`/api/brands/${orgABrandId}/topical-gaps`),
        makeParams(orgABrandId),
      );
      expect([403, 404]).toContain(res.status);
      const body = await res.json();
      expect(body.gaps).toBeUndefined();
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: null });
    });

    it("⚠️ site-readiness: org B user requesting org A brand → denied", async () => {
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: [orgBBrandId] });
      setAuthAs(orgBId, orgBUserId);
      const res = await getSiteReadiness(
        makeReq(`/api/brands/${orgABrandId}/site-readiness`),
        makeParams(orgABrandId),
      );
      expect([403, 404]).toContain(res.status);
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: null });
    });

    it("⚠️ tasks: org B user requesting org A brand → denied", async () => {
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: [orgBBrandId] });
      setAuthAs(orgBId, orgBUserId);
      const res = await getTasks(
        makeReq(`/api/brands/${orgABrandId}/tasks`),
        makeParams(orgABrandId),
      );
      expect([403, 404]).toContain(res.status);
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: null });
    });

    it("⚠️ agent-readiness: org B user requesting org A brand → denied", async () => {
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: [orgBBrandId] });
      setAuthAs(orgBId, orgBUserId);
      const res = await getAgentReadiness(
        makeReq(`/api/brands/${orgABrandId}/agent-readiness`),
        makeParams(orgABrandId),
      );
      expect([403, 404]).toContain(res.status);
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: null });
    });

    it("⚠️ brands/{id}: org B user requesting org A brand → denied", async () => {
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: [orgBBrandId] });
      setAuthAs(orgBId, orgBUserId);
      const res = await getBrand(
        makeReq(`/api/brands/${orgABrandId}`),
        makeParams(orgABrandId),
      );
      expect([403, 404]).toContain(res.status);
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: null });
    });
  });

  describe("no session → 401", () => {
    it("unauthenticated request returns 401", async () => {
      clearAuth();
      const res = await getLatestAudit(
        makeReq(`/api/brands/${orgABrandId}/latest-audit`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("⚠️ BREAK-PROOF: brand lookup also scopes by organizationId", () => {
    it("even with access granted, brand lookup by org prevents cross-org read", async () => {
      // Seed a subscription for orgB so tier gate passes (we're testing brand scoping, not tier)
      await client`DELETE FROM subscriptions WHERE organization_id = ${orgBId}`.catch(() => {});
      const [subB] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgBId}, 'growth', 'active', 'monthly', 's9int_s22_cus_b', 's9int_s22_sub_b', 's9int_s22_price_b')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(subB.id);
      // Grant access (brandAccess: null = all), but auth as org B
      mockGetMemberRecord.mockResolvedValue({ role: "owner", brandAccess: null });
      setAuthAs(orgBId, orgBUserId);
      // org A's brand should fail the org-scoped brand lookup
      const res = await getSiteReadiness(
        makeReq(`/api/brands/${orgABrandId}/site-readiness`),
        makeParams(orgABrandId),
      );
      // Should be 404 because brand doesn't belong to org B
      expect(res.status).toBe(404);
      // Cleanup
      await client`DELETE FROM subscriptions WHERE organization_id = ${orgBId}`.catch(() => {});
    });
  });
});

// ═══════════════════════════════════════════════════════════
// §2.3 — TIER GATES
// ═══════════════════════════════════════════════════════════

describe("§2.3 — Tier Gates (subscriptions.tier is sole source)", () => {
  afterEach(async () => {
    for (const id of CLEANUP.subscriptionIds) {
      await client`DELETE FROM subscriptions WHERE id = ${id}`.catch(() => {});
    }
    CLEANUP.subscriptionIds = [];
  });

  describe("action-progress: Growth+ required", () => {
    it("no subscription (free) → 403", async () => {
      setAuthAs(orgAId);
      const res = await getActionProgress(
        makeReq(`/api/brands/${orgABrandId}/action-progress`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
    });

    it("growth tier → 200", async () => {
      setAuthAs(orgAId);
      const [sub] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(sub.id);
      const res = await getActionProgress(
        makeReq(`/api/brands/${orgABrandId}/action-progress`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("journeys: Agency+ required", () => {
    it("growth tier → 403", async () => {
      setAuthAs(orgAId);
      const [sub] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(sub.id);
      const res = await getJourneys(
        makeReq(`/api/brands/${orgABrandId}/journeys`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
    });

    it("agency tier → 200", async () => {
      setAuthAs(orgAId);
      const [sub] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgAId}, 'agency', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(sub.id);
      const res = await getJourneys(
        makeReq(`/api/brands/${orgABrandId}/journeys`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("⚠️ subscriptions.tier is SOLE source — NOT organizations.tier (S8 footgun)", () => {
    it("organizations.tier='free' but subscriptions.tier='growth' → ALLOWED", async () => {
      setAuthAs(orgAId);
      // org table already has tier='free' from seed
      const [sub] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(sub.id);
      const res = await getActionProgress(
        makeReq(`/api/brands/${orgABrandId}/action-progress`),
        makeParams(orgABrandId),
      );
      // If route read organizations.tier instead, this would be 403
      expect(res.status).toBe(200);
    });
  });

  describe("comparisons: Growth+ required", () => {
    it("no subscription → 403", async () => {
      setAuthAs(orgAId);
      const res = await getComparisons(
        makeReq(`/api/brands/${orgABrandId}/comparisons`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("F28 FIX: 6 newly-gated Growth+ routes", () => {
    it("latest-audit: no subscription (free) → 403", async () => {
      setAuthAs(orgAId);
      const res = await getLatestAudit(
        makeReq(`/api/brands/${orgABrandId}/latest-audit`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Growth plan required");
    });

    it("topical-gaps: no subscription (free) → 403", async () => {
      setAuthAs(orgAId);
      const res = await getTopicalGaps(
        makeReq(`/api/brands/${orgABrandId}/topical-gaps`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Growth plan required");
    });

    it("tasks: no subscription (free) → 403", async () => {
      setAuthAs(orgAId);
      const res = await getTasks(
        makeReq(`/api/brands/${orgABrandId}/tasks`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Growth plan required");
    });

    it("drafts: no subscription (free) → 403", async () => {
      setAuthAs(orgAId);
      const res = await getDrafts(
        makeReq(`/api/brands/${orgABrandId}/drafts`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Growth plan required");
    });

    it("agent-readiness: no subscription (free) → 403", async () => {
      setAuthAs(orgAId);
      const res = await getAgentReadiness(
        makeReq(`/api/brands/${orgABrandId}/agent-readiness`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Growth plan required");
    });

    it("site-readiness: no subscription (free) → 403", async () => {
      setAuthAs(orgAId);
      const res = await getSiteReadiness(
        makeReq(`/api/brands/${orgABrandId}/site-readiness`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Growth plan required");
    });

    it("latest-audit: growth tier → 200 (not blocked)", async () => {
      setAuthAs(orgAId);
      const [sub] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(sub.id);
      const res = await getLatestAudit(
        makeReq(`/api/brands/${orgABrandId}/latest-audit`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
    });

    it("topical-gaps: growth tier → 200", async () => {
      setAuthAs(orgAId);
      const [sub] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(sub.id);
      const res = await getTopicalGaps(
        makeReq(`/api/brands/${orgABrandId}/topical-gaps`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
    });

    it("tasks: growth tier → 200", async () => {
      setAuthAs(orgAId);
      const [sub] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(sub.id);
      const res = await getTasks(
        makeReq(`/api/brands/${orgABrandId}/tasks`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
    });

    it("⚠️ tasks POST: no subscription (free) → 403 (cannot CREATE tasks)", async () => {
      setAuthAs(orgAId);
      const postReq = new Request(`http://localhost:3000/api/brands/${orgABrandId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Free-tier task attempt" }),
      });
      const res = await postTasks(postReq, makeParams(orgABrandId));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Growth plan required");
    });

    it("⚠️ drafts POST: no subscription (free) → 403 (cannot GENERATE drafts)", async () => {
      setAuthAs(orgAId);
      const postReq = new Request(`http://localhost:3000/api/brands/${orgABrandId}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "00000000-0000-0000-0000-000000000001" }),
      });
      const res = await postDrafts(postReq, makeParams(orgABrandId));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Growth plan required");
    });
  });

  describe("⚠️ BREAK-PROOF F28: assertTier source code presence in all 6 routes", () => {
    it("all 6 route files import and call assertTier (grep-proof)", () => {
      const { readFileSync } = require("fs");
      const routes = [
        "app/api/brands/[brandId]/latest-audit/route.ts",
        "app/api/brands/[brandId]/topical-gaps/route.ts",
        "app/api/brands/[brandId]/tasks/route.ts",
        "app/api/brands/[brandId]/drafts/route.ts",
        "app/api/brands/[brandId]/agent-readiness/route.ts",
        "app/api/brands/[brandId]/site-readiness/route.ts",
      ];
      for (const route of routes) {
        const source = readFileSync(route, "utf-8");
        expect(source).toContain("assertTier");
        expect(source).toContain("TierInsufficientError");
        expect(source).toContain("Growth plan required");
      }
    });

    it("assertTier reads subscriptions.tier (not organizations.tier)", () => {
      const { readFileSync } = require("fs");
      const source = readFileSync("lib/governance/access-control.ts", "utf-8");
      expect(source).toContain("subscriptions.tier");
      expect(source).toContain("isTierAtLeast");
      expect(source).not.toMatch(/organizations\.tier/);
    });
  });

  describe("⚠️ S8 FOOTGUN: organizations.tier vs subscriptions.tier for F28 routes", () => {
    it("organizations.tier='free' + subscriptions.tier='growth' → 200 on latest-audit", async () => {
      setAuthAs(orgAId);
      const [sub] = await client`
        INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
          stripe_customer_id, stripe_subscription_id, stripe_price_id)
        VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
        RETURNING id
      `;
      CLEANUP.subscriptionIds.push(sub.id);
      const res = await getLatestAudit(
        makeReq(`/api/brands/${orgABrandId}/latest-audit`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(200);
    });

    it("no subscription row at all → defaults to free → 403", async () => {
      setAuthAs(orgAId);
      await client`DELETE FROM subscriptions WHERE organization_id = ${orgAId}`.catch(() => {});
      const res = await getTopicalGaps(
        makeReq(`/api/brands/${orgABrandId}/topical-gaps`),
        makeParams(orgABrandId),
      );
      expect(res.status).toBe(403);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// §2.4 — TRACKER QUERY (real DB, the Section 1 gap)
// ═══════════════════════════════════════════════════════════

describe("§2.4 — Tracker Query (progress-summary, real DB)", () => {
  beforeAll(async () => {
    await client`DELETE FROM subscriptions WHERE organization_id = ${orgAId}`.catch(() => {});
    const [sub] = await client`
      INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
        stripe_customer_id, stripe_subscription_id, stripe_price_id)
      VALUES (${orgAId}, 'growth', 'active', 'monthly', 's9int_cus_a', 's9int_sub_a', 's9int_price_a')
      RETURNING id
    `;
    CLEANUP.subscriptionIds.push(sub.id);
    setAuthAs(orgAId);
  });

  it("returns completedThisMonth counting tasks by completedAt (not updatedAt)", async () => {
    const res = await getActionProgress(
      makeReq(`/api/brands/${orgABrandId}/action-progress`),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // task2 (completed NOW()) definitely counts.
    // task4 (completed June 15) must NOT count — regardless of TZ.
    // task5 (status='completed' not 'complete') must NOT count.
    expect(body.completedThisMonth).toBeGreaterThanOrEqual(1);
    // task4 is excluded: proof that completedAt is used, not updatedAt
    // (task4 has updatedAt=NOW but completedAt=June 15 — deep in past)
    expect(body.completedThisMonth).toBeLessThanOrEqual(2);
  });

  it("⚠️ F1: updated_at this month + completed_at last month → NOT counted", async () => {
    // Seed a task with completed_at deep in the past (well before any TZ offset)
    // and updated_at = NOW(). If code used updated_at, this would count.
    const [deepPast] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority,
        completed_at, updated_at, score_after, lift_achieved)
      VALUES (${orgAId}, ${orgASaasBrandId}, 'F1 deep-past proof', 'complete', 100,
        '2026-01-15 12:00:00+00', NOW(), 99.00, 99.00)
      RETURNING id
    `;
    CLEANUP.taskIds.push(deepPast.id);
    const res = await getActionProgress(
      makeReq(`/api/brands/${orgASaasBrandId}/action-progress`),
      makeParams(orgASaasBrandId),
    );
    const body = await res.json();
    // If code used updatedAt instead of completedAt, this would be 1.
    // Canon: completed Jan 15 → not "this month" → completedThisMonth = 0
    expect(body.completedThisMonth).toBe(0);
  });

  it("⚠️ F21 FIXED: AEST/UTC boundary — 2026-06-30T23:00Z does NOT count for July", async () => {
    // task3: completed_at = '2026-06-30 23:00:00+00' — JUNE in UTC.
    // Server TZ=Australia/Sydney. Pre-fix, date_trunc('month', now()) gave AEST boundary
    // (2026-06-30T14:00Z), wrongly counting this task.
    // Post-fix: date_trunc('month', now() AT TIME ZONE 'UTC') gives 2026-07-01T00:00Z.
    // task3 is correctly excluded.
    const res = await getActionProgress(
      makeReq(`/api/brands/${orgABrandId}/action-progress`),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    expect(body.completedThisMonth).toBe(1);
  });

  it("⚠️ F21 BREAK-PROOF: task at 14:30 UTC (inside the AEST broken window) is June, not July", async () => {
    // 2026-06-30T14:30Z = 2026-07-01 00:30 AEST (inside the broken window).
    // Under AEST truncation: month start = 2026-06-30T14:00Z → this task counts as July. WRONG.
    // Under UTC truncation: month start = 2026-07-01T00:00Z → this task is June. CORRECT.
    const [windowTask] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority,
        completed_at, score_after, lift_achieved)
      VALUES (${orgAId}, ${orgASaasBrandId}, 'F21 window task', 'complete', 100,
        '2026-06-30 14:30:00+00', 80.00, 10.00)
      RETURNING id
    `;
    CLEANUP.taskIds.push(windowTask.id);
    const res = await getActionProgress(
      makeReq(`/api/brands/${orgASaasBrandId}/action-progress`),
      makeParams(orgASaasBrandId),
    );
    const body = await res.json();
    // Under UTC: this is June → completedThisMonth = 0 for this brand
    // Under AEST: this would wrongly be July → completedThisMonth = 1
    // Reverting to date_trunc('month', now()) causes this to go RED.
    expect(body.completedThisMonth).toBe(0);
  });

  it("status='complete' (no -d) — 'completed' row must NOT count", async () => {
    // Use SaaS brand to isolate: seed one 'complete' and one 'completed' task
    const [goodTask] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority, completed_at)
      VALUES (${orgAId}, ${orgASaasBrandId}, 'Status correct', 'complete', 100, NOW())
      RETURNING id
    `;
    CLEANUP.taskIds.push(goodTask.id);
    const [badTask] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority, completed_at)
      VALUES (${orgAId}, ${orgASaasBrandId}, 'Status wrong spelling', 'completed', 100, NOW())
      RETURNING id
    `;
    CLEANUP.taskIds.push(badTask.id);
    const res = await getActionProgress(
      makeReq(`/api/brands/${orgASaasBrandId}/action-progress`),
      makeParams(orgASaasBrandId),
    );
    const body = await res.json();
    // Only the 'complete' task counts, not 'completed'
    expect(body.completedThisMonth).toBe(1);
  });

  it("measuredImpact = SUM(lift_achieved) WHERE score_after IS NOT NULL (this month UTC)", async () => {
    const res = await getActionProgress(
      makeReq(`/api/brands/${orgABrandId}/action-progress`),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    // Only task2 completed this month (UTC): lift_achieved = 8.50
    // task3 (June 30 23:00 UTC) is correctly excluded by UTC boundary
    expect(Number(body.measuredImpact)).toBeCloseTo(8.5, 1);
  });

  it("no rows → 0, not NULL (COALESCE)", async () => {
    // Use orgB brand which has zero tasks seeded
    setAuthAs(orgBId, orgBUserId);
    // Need a subscription for orgB
    await client`DELETE FROM subscriptions WHERE organization_id = ${orgBId}`.catch(() => {});
    const [subB] = await client`
      INSERT INTO subscriptions (organization_id, tier, status, billing_interval,
        stripe_customer_id, stripe_subscription_id, stripe_price_id)
      VALUES (${orgBId}, 'growth', 'active', 'monthly', 's9int_cus_b', 's9int_sub_b', 's9int_price_b')
      RETURNING id
    `;
    CLEANUP.subscriptionIds.push(subB.id);
    const res = await getActionProgress(
      makeReq(`/api/brands/${orgBBrandId}/action-progress`),
      makeParams(orgBBrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completedThisMonth).toBe(0);
    expect(body.totalTasks).toBe(0);
    // Restore auth
    setAuthAs(orgAId);
  });

  it("⚠️ route calls lib/workflow/progress-summary (not its own query — F3 root cause)", () => {
    const routeSource = readFileSync(
      path.resolve("app/api/brands/[brandId]/action-progress/route.ts"),
      "utf-8",
    );
    expect(routeSource).toContain("getProgressSummary");
    expect(routeSource).toContain("@/lib/workflow/progress-summary");
    expect(routeSource).not.toMatch(/date_trunc/);
    expect(routeSource).not.toMatch(/remediation_tasks/i);
  });

  it("⚠️ progress-summary uses completedAt, NOT updatedAt (F1 source guard)", () => {
    const src = readFileSync(
      path.resolve("lib/workflow/progress-summary.ts"),
      "utf-8",
    );
    expect(src).toContain("completedAt");
    expect(src).not.toMatch(/gte\(.*updatedAt/);
  });

  it("⚠️ F21: progress-summary uses UTC-explicit date_trunc", () => {
    const src = readFileSync(
      path.resolve("lib/workflow/progress-summary.ts"),
      "utf-8",
    );
    expect(src).toContain("AT TIME ZONE 'UTC'");
    expect(src).not.toMatch(/date_trunc\('month',\s*now\(\)\s*\)`/);
  });

  it("⚠️ F22: getProgressSummary accepts a db/tx parameter (not hardcoded serviceDb)", () => {
    const src = readFileSync(
      path.resolve("lib/workflow/progress-summary.ts"),
      "utf-8",
    );
    expect(src).toMatch(/getProgressSummary\(\s*brandId.*,\s*\n?\s*db:/);
    expect(src).toContain("db: DbClient");
  });
});

// ═══════════════════════════════════════════════════════════
// §2.5 — HEALTH CHECK DIMENSION SOURCES (end-to-end, real rows)
// ═══════════════════════════════════════════════════════════

describe("§2.5 — Health Check Dimension Sources (real DB)", () => {
  beforeAll(() => setAuthAs(orgAId));

  it("Site Readiness comes from technical_audits.scoreComposite, NOT audits", async () => {
    const res = await getSiteReadiness(
      makeReq(`/api/brands/${orgABrandId}/site-readiness`),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // technical_audits.score_composite = 21.00
    // audits.score_composite = 23.67 (deliberately different)
    expect(Number(body.scoreComposite)).toBeCloseTo(21, 0);
    expect(Number(body.scoreComposite)).not.toBeCloseTo(23.67, 0);
  });

  it("agent-readiness returns localAiTrustScore for Local Authority", async () => {
    const res = await getAgentReadiness(
      makeReq(`/api/brands/${orgABrandId}/agent-readiness`),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.latest).not.toBeNull();
    expect(Number(body.latest.localAiTrustScore)).toBeCloseTo(20, 0);
  });

  it("latest-audit returns scoreSentimentNumeric and scoreFrequency", async () => {
    const res = await getLatestAudit(
      makeReq(`/api/brands/${orgABrandId}/latest-audit`),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    expect(Number(body.audit.scoreSentimentNumeric)).toBeCloseTo(50, 0);
    expect(Number(body.audit.scoreFrequency)).toBeCloseTo(0, 0);
  });

  it("SaaS brand → no agent-readiness data (latest is null)", async () => {
    const res = await getAgentReadiness(
      makeReq(`/api/brands/${orgASaasBrandId}/agent-readiness`),
      makeParams(orgASaasBrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.latest).toBeNull();
  });

  it("Bondi answer key: Sentiment 50 · Frequency 0 · Site 21 through separate APIs", async () => {
    const [auditRes, siteRes] = await Promise.all([
      getLatestAudit(makeReq(`/api/brands/${orgABrandId}/latest-audit`), makeParams(orgABrandId)),
      getSiteReadiness(makeReq(`/api/brands/${orgABrandId}/site-readiness`), makeParams(orgABrandId)),
    ]);
    const audit = (await auditRes.json()).audit;
    const site = await siteRes.json();
    expect(Number(audit.scoreSentimentNumeric)).toBe(50);
    expect(Number(audit.scoreFrequency)).toBe(0);
    expect(Number(site.scoreComposite)).toBe(21);
  });
});

// ═══════════════════════════════════════════════════════════
// §2.6 — THE #1 ACTION
// ═══════════════════════════════════════════════════════════

describe("§2.6 — #1 Action (remediation_tasks, open, priority order)", () => {
  beforeAll(() => setAuthAs(orgAId));

  it("returns open tasks including the priority-5000 task", async () => {
    const res = await getTasks(
      makeReq(`/api/brands/${orgABrandId}/tasks?status=open`),
      makeParams(orgABrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const openTasks = body.filter((t: { status: string }) => t.status === "open");
    expect(openTasks.length).toBeGreaterThanOrEqual(1);
    const top = openTasks.find((t: { title: string }) => t.title === "Update local directory listings");
    expect(top).toBeDefined();
  });

  it("⚠️ F9/F13: description is NULL — returns honestly, no fabrication, no crash", async () => {
    const res = await getTasks(
      makeReq(`/api/brands/${orgABrandId}/tasks?status=open`),
      makeParams(orgABrandId),
    );
    const body = await res.json();
    const top = body.find((t: { title: string }) => t.title === "Update local directory listings");
    expect(top).toBeDefined();
    expect(top.description).toBeNull();
  });

  it("brand with no open tasks → empty array (honest empty)", async () => {
    const res = await getTasks(
      makeReq(`/api/brands/${orgASaasBrandId}/tasks?status=open`),
      makeParams(orgASaasBrandId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// STRUCTURAL ASSERTIONS (source-level)
// ═══════════════════════════════════════════════════════════

describe("STRUCTURAL: route delegates + source-level guards", () => {
  it("action-progress imports getProgressSummary from canonical module", () => {
    const src = readFileSync(
      path.resolve("app/api/brands/[brandId]/action-progress/route.ts"),
      "utf-8",
    );
    expect(src).toContain('from "@/lib/workflow/progress-summary"');
    expect(src).toContain("getProgressSummary");
  });

  it("tier gates read subscriptions table, not organizations.tier", () => {
    const actionProgressSrc = readFileSync(
      path.resolve("app/api/brands/[brandId]/action-progress/route.ts"),
      "utf-8",
    );
    expect(actionProgressSrc).toContain("subscriptions");
    expect(actionProgressSrc).not.toMatch(/organizations\.tier/);

    const journeysSrc = readFileSync(
      path.resolve("app/api/brands/[brandId]/journeys/route.ts"),
      "utf-8",
    );
    expect(journeysSrc).toContain("subscriptions");
    expect(journeysSrc).not.toMatch(/organizations\.tier/);
  });

  it("all gated routes import assertBrandAccess", () => {
    const routeFiles = [
      "app/api/brands/[brandId]/latest-audit/route.ts",
      "app/api/brands/[brandId]/topical-gaps/route.ts",
      "app/api/brands/[brandId]/tasks/route.ts",
      "app/api/brands/[brandId]/drafts/route.ts",
      "app/api/brands/[brandId]/agent-readiness/route.ts",
      "app/api/brands/[brandId]/site-readiness/route.ts",
      "app/api/brands/[brandId]/journeys/route.ts",
      "app/api/brands/[brandId]/comparisons/route.ts",
      "app/api/brands/[brandId]/action-progress/route.ts",
    ];
    for (const rf of routeFiles) {
      const src = readFileSync(path.resolve(rf), "utf-8");
      expect(src).toContain("assertBrandAccess");
    }
  });
});

// ═══════════════════════════════════════════════════════════
// §2.7 — RLS PROOF (F22b: prove Postgres RLS enforces isolation)
// ═══════════════════════════════════════════════════════════

describe("§2.7 — RLS Proof (remediation_tasks org isolation via Postgres policy)", () => {
  let rlsOrgBTaskId: string;

  beforeAll(async () => {
    // Seed a remediation_task for org B (different org than org A)
    const [task] = await client`
      INSERT INTO remediation_tasks (organization_id, brand_id, title, status, priority, completed_at, score_after, lift_achieved)
      VALUES (${orgBId}, ${orgBBrandId}, 'OrgB RLS test task', 'complete', 1000, NOW(), 80.00, 10.00)
      RETURNING id
    `;
    rlsOrgBTaskId = task.id;
  });

  afterAll(async () => {
    if (rlsOrgBTaskId) {
      await client`DELETE FROM remediation_tasks WHERE id = ${rlsOrgBTaskId}`.catch(() => {});
    }
  });

  it("⚠️ CONTROL: superuser (postgres) sees org B task (data really exists)", async () => {
    const rows = await client`
      SELECT id, title FROM remediation_tasks
      WHERE id = ${rlsOrgBTaskId}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("OrgB RLS test task");
  });

  it("⚠️ RLS ENFORCED: app role with org A context cannot see org B tasks", async () => {
    const rows = await client.begin(async (tx) => {
      await tx`SET LOCAL ROLE visibleau_app`;
      await tx`SELECT set_config('app.current_org_id', ${orgAId}, true)`;
      // Query ALL remediation_tasks for org B's brand — no app-level filter
      // If RLS is working, this returns 0 rows despite the brand_id match
      return tx`
        SELECT id, title, organization_id FROM remediation_tasks
        WHERE brand_id = ${orgBBrandId}
      `;
    });
    expect(rows.length).toBe(0);
  });

  it("⚠️ RLS ENFORCED: app role with org B context CAN see org B tasks", async () => {
    const rows = await client.begin(async (tx) => {
      await tx`SET LOCAL ROLE visibleau_app`;
      await tx`SELECT set_config('app.current_org_id', ${orgBId}, true)`;
      return tx`
        SELECT id, title FROM remediation_tasks
        WHERE brand_id = ${orgBBrandId}
      `;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some((r: { title: string }) => r.title === "OrgB RLS test task")).toBe(true);
  });

  it("⚠️ BREAK-PROOF: disabling RLS leaks org B data to org A context", async () => {
    // Temporarily disable RLS, prove cross-org data leaks, then re-enable
    await client`ALTER TABLE remediation_tasks DISABLE ROW LEVEL SECURITY`;
    try {
      const rows = await client.begin(async (tx) => {
        await tx`SET LOCAL ROLE visibleau_app`;
        await tx`SELECT set_config('app.current_org_id', ${orgAId}, true)`;
        return tx`
          SELECT id, title FROM remediation_tasks
          WHERE brand_id = ${orgBBrandId}
        `;
      });
      // With RLS disabled, org A context can see org B's tasks → leak!
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r: { title: string }) => r.title === "OrgB RLS test task")).toBe(true);
    } finally {
      // Always re-enable RLS
      await client`ALTER TABLE remediation_tasks ENABLE ROW LEVEL SECURITY`;
    }
  });
});
