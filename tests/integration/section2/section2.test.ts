/**
 * Section 2 — Backend Integration Tests (route handlers + real test DB)
 *
 * Dedicated `visibleau_test` DB — NEVER dev or prod.
 * Tests at the route-handler level with mocked auth.
 * Every test proven by break-proof: flip the guard → fail → restore → pass.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import type postgres from "postgres";

// ═══════════════════════════════════════════════════════════════════
// Module mocks — declared before imports so vitest hoists them
// ═══════════════════════════════════════════════════════════════════

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// Redirect db/client to visibleau_test
vi.mock("@/db/client", async () => {
  const pg = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { sql } = await import("drizzle-orm");
  const schema = await import("@/db/schema");

  const TEST_URL = "postgresql://postgres:password@localhost:5432/visibleau_test";
  const client = pg(TEST_URL, { max: 5, idle_timeout: 20, connect_timeout: 10 });
  const testDb = drizzle(client, { schema });

  return {
    db: testDb,
    serviceDb: testDb,
    withRlsContext: async (orgId: string, fn: (tx: any) => Promise<any>) => {
      return testDb.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
        return fn(tx);
      });
    },
  };
});

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createTestClient,
  assertTestDatabase,
  seedFixtures,
  truncateTestTables,
  teardownFixtures,
  makeOwnerUser,
  makeOtherUser,
  OWNER_ORG_ID,
  OWNER_BRAND_ID,
  OTHER_ORG_ID,
} from "./_harness";

const mockedGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;

let pgClient: ReturnType<typeof createTestClient>;

// ═══════════════════════════════════════════════════════════════════
// Setup / Teardown
// ═══════════════════════════════════════════════════════════════════

beforeAll(async () => {
  pgClient = createTestClient();
  await assertTestDatabase(pgClient);
  await seedFixtures(pgClient);
}, 30_000);

afterEach(async () => {
  await truncateTestTables(pgClient);
  vi.clearAllMocks();
});

afterAll(async () => {
  await teardownFixtures(pgClient);
  await pgClient.end();
}, 15_000);

// ═══════════════════════════════════════════════════════════════════
// STEP 0 — Smoke test: harness works
// ═══════════════════════════════════════════════════════════════════

describe("Step 0: Harness smoke test", () => {
  it("connects to visibleau_test (not dev, not prod)", async () => {
    const [row] = await pgClient`SELECT current_database() AS db`;
    expect(row.db).toBe("visibleau_test");
    expect(row.db).not.toBe("visibleau");
    expect(row.db).not.toBe("visibleau_prod");
  });

  it("overview route returns 200 for brand owner", async () => {
    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/overview/route");

    const response = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/overview`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("overview");
    expect(body.overview).toHaveProperty("volumeByVendor");
    expect(body.overview).toHaveProperty("volumeByPurpose");
    expect(body.overview).toHaveProperty("verificationRates");
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 1 — Cross-org access → 404 (locks FIX-03)
// ═══════════════════════════════════════════════════════════════════

describe("Step 1: Cross-org access → 404 (assertBrandAccess)", () => {
  it("owner gets 200 on overview", async () => {
    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/overview/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/overview`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("non-owner gets 404 on overview (not 401, not 200 — spec §4)", async () => {
    mockedGetCurrentUser.mockResolvedValue(makeOtherUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/overview/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/overview`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(200);
  });

  it("non-owner gets 404 on ratio", async () => {
    mockedGetCurrentUser.mockResolvedValue(makeOtherUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/ratio/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/ratio`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("unauthenticated gets 401 (not 404)", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/overview/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/overview`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 2 — Tier gates → 403 (reads subscriptions.tier)
// ═══════════════════════════════════════════════════════════════════

describe("Step 2: Tier gates → 403 (assertTier reads subscriptions.tier)", () => {
  it("growth-tier org gets 200 on ratio (Growth required)", async () => {
    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/ratio/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/ratio`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("starter-tier org gets 403 on ratio (Growth required)", async () => {
    // Downgrade owner org's subscription to starter
    await pgClient`UPDATE subscriptions SET tier = 'starter' WHERE organization_id = ${OWNER_ORG_ID}`;

    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/ratio/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/ratio`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(403);

    // Restore
    await pgClient`UPDATE subscriptions SET tier = 'growth' WHERE organization_id = ${OWNER_ORG_ID}`;
  });

  it("starter-tier org gets 200 on overview (Starter+ surface)", async () => {
    // Downgrade to starter — overview requires 'starter', not 'growth'
    await pgClient`UPDATE subscriptions SET tier = 'starter' WHERE organization_id = ${OWNER_ORG_ID}`;

    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/overview/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/overview`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(200);

    // Restore
    await pgClient`UPDATE subscriptions SET tier = 'growth' WHERE organization_id = ${OWNER_ORG_ID}`;
  });

  it("free-tier org gets 403 on overview (Starter+ surface)", async () => {
    // Downgrade to free — overview requires 'starter'
    await pgClient`UPDATE subscriptions SET tier = 'free' WHERE organization_id = ${OWNER_ORG_ID}`;

    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/overview/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/overview`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    expect(res.status).toBe(403);

    // Restore
    await pgClient`UPDATE subscriptions SET tier = 'growth' WHERE organization_id = ${OWNER_ORG_ID}`;
  });

  it("reads subscriptions.tier NOT organizations.tier (seeded DIFFERENT to catch wrong read)", async () => {
    // organizations.tier = 'free', subscriptions.tier = 'growth'
    // If the guard reads organizations.tier, it would 403 on ratio
    // But it should read subscriptions.tier='growth' → 200
    const [orgRow] = await pgClient`SELECT tier FROM organizations WHERE id = ${OWNER_ORG_ID}`;
    const [subRow] = await pgClient`SELECT tier FROM subscriptions WHERE organization_id = ${OWNER_ORG_ID}`;
    expect(orgRow.tier).toBe("free");
    expect(subRow.tier).toBe("growth");

    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/ratio/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/ratio`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );
    // If it wrongly reads organizations.tier='free', this would be 403
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 3 — Verification query: inet cast (locks FIX-04)
// ═══════════════════════════════════════════════════════════════════

describe("Step 3: CIDR containment with real inet/cidr types", () => {
  it("checkCidrContainment works against real DB with cidr column type", async () => {
    // Seed IP range
    await pgClient`
      INSERT INTO ai_bot_ip_ranges (vendor, cidr, source_url, version_hash, is_current)
      VALUES ('openai', '40.88.0.0/14', 'https://openai.com/ranges.json', 'testhash1', true)
    `;

    const { checkCidrContainment } = await import("@/lib/agent-analytics/ip-ranges");

    const inRange = await checkCidrContainment("40.88.21.235", "openai");
    expect(inRange).toBe(true);

    const outOfRange = await checkCidrContainment("198.51.100.1", "openai");
    expect(outOfRange).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 4 — Metrics Date-as-SQL-param (locks FIX-02)
// ═══════════════════════════════════════════════════════════════════

describe("Step 4: Date params don't crash the driver (.toISOString fix)", () => {
  it("overview route with seeded data returns 200 + correct shape", async () => {
    // Seed crawler visit logs with recent timestamps
    const now = new Date();
    const recentTs = new Date(now.getTime() - 3600_000).toISOString(); // 1 hour ago

    await pgClient`
      INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, visit_purpose, verification_status, visited_at, source_ip, ingest_source)
      VALUES
        (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'GPTBot', 'must_allow', 'https://s2-test.local/page1', 'indexing', 'verified', ${recentTs}::timestamptz, '40.88.21.1', 'log_upload'),
        (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'GPTBot', 'must_allow', 'https://s2-test.local/page2', 'indexing', 'unverified', ${recentTs}::timestamptz, '40.88.21.2', 'log_upload'),
        (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'GPTBot', 'must_allow', 'https://s2-test.local/page3', 'retrieval', 'verified', ${recentTs}::timestamptz, '40.88.21.3', 'log_upload')
    `;

    mockedGetCurrentUser.mockResolvedValue(makeOwnerUser());
    const { GET } = await import("@/app/api/brands/[brandId]/agent-analytics/overview/route");

    const res = await GET(
      new Request(`http://localhost/api/brands/${OWNER_BRAND_ID}/agent-analytics/overview?days=1`),
      { params: Promise.resolve({ brandId: OWNER_BRAND_ID }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // Verify the Date params exercised the queries correctly
    expect(body.overview.volumeByVendor).toBeInstanceOf(Array);
    expect(body.overview.volumeByPurpose).toBeInstanceOf(Array);
    expect(body.overview.verificationRates).toBeInstanceOf(Array);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 5 — serviceDb.execute() returns array, not {rows}
// ═══════════════════════════════════════════════════════════════════

describe("Step 5: serviceDb.execute() result shape — array iteration works", () => {
  it("getVolumeByVendor returns real rows from seeded data", async () => {
    const now = new Date();
    const recentTs = new Date(now.getTime() - 3600_000).toISOString();

    await pgClient`
      INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, visit_purpose, verification_status, visited_at, source_ip, ingest_source)
      VALUES
        (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'GPTBot', 'must_allow', 'https://s2-test.local/a', 'indexing', 'verified', ${recentTs}::timestamptz, '40.88.21.1', 'log_upload'),
        (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'GPTBot', 'must_allow', 'https://s2-test.local/b', 'retrieval', 'verified', ${recentTs}::timestamptz, '40.88.21.2', 'log_upload')
    `;

    const { getVolumeByVendor } = await import("@/lib/agent-analytics/metrics");

    const periodStart = new Date(now.getTime() - 86400_000);
    const results = await getVolumeByVendor(OWNER_BRAND_ID, periodStart, now);

    // Must be non-empty — if .rows was used on an array, results would be empty/undefined
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);

    const openai = results.find((r: any) => r.vendor === "openai");
    expect(openai).toBeDefined();
    expect(openai!.total).toBe(2);
    expect(openai!.retrieval).toBe(1);
    expect(openai!.indexing).toBe(1);
  });

  it("getVerificationRates returns real rows from seeded data", async () => {
    const now = new Date();
    const recentTs = new Date(now.getTime() - 3600_000).toISOString();

    await pgClient`
      INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, visit_purpose, verification_status, visited_at, source_ip, ingest_source)
      VALUES
        (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'GPTBot', 'must_allow', 'https://s2-test.local/x', 'indexing', 'verified', ${recentTs}::timestamptz, '40.88.21.1', 'log_upload'),
        (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'GPTBot', 'must_allow', 'https://s2-test.local/y', 'indexing', 'unverified', ${recentTs}::timestamptz, '40.88.21.2', 'log_upload'),
        (${OWNER_BRAND_ID}, ${OWNER_ORG_ID}, 'GPTBot', 'must_allow', 'https://s2-test.local/z', 'indexing', 'spoofed', ${recentTs}::timestamptz, '40.88.21.3', 'log_upload')
    `;

    const { getVerificationRates } = await import("@/lib/agent-analytics/metrics");

    const periodStart = new Date(now.getTime() - 86400_000);
    const rates = await getVerificationRates(OWNER_BRAND_ID, periodStart, now);

    expect(rates).toBeInstanceOf(Array);
    expect(rates.length).toBeGreaterThan(0);

    const openai = rates.find((r: any) => r.vendor === "openai");
    expect(openai).toBeDefined();
    expect(openai!.verified).toBe(1);
    expect(openai!.unverified).toBe(1);
    expect(openai!.spoofed).toBe(1);
    expect(openai!.total).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 6 — Impersonation task emission (full flow)
// ═══════════════════════════════════════════════════════════════════

describe("Step 6: emitImpersonationTasks fires when unverifiedRate > 25%", () => {
  it("emits a task when > 25% unverified and ≥ 10 hits", async () => {
    // Feed getVerificationRates a brand with >25% unverified (4 unverified out of 12 = 33%)
    const now = new Date();
    const recentTs = new Date(now.getTime() - 3600_000).toISOString();

    // 8 verified + 4 unverified = 12 total, 33% unverified
    const values = [];
    for (let i = 0; i < 8; i++) {
      values.push(`('${OWNER_BRAND_ID}', '${OWNER_ORG_ID}', 'GPTBot', 'must_allow', 'https://s2-test.local/v${i}', 'indexing', 'verified', '${recentTs}'::timestamptz, '40.88.${i}.1', 'log_upload')`);
    }
    for (let i = 0; i < 4; i++) {
      values.push(`('${OWNER_BRAND_ID}', '${OWNER_ORG_ID}', 'GPTBot', 'must_allow', 'https://s2-test.local/u${i}', 'indexing', 'unverified', '${recentTs}'::timestamptz, '40.88.${i}.2', 'log_upload')`);
    }
    await pgClient.unsafe(`
      INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, visit_purpose, verification_status, visited_at, source_ip, ingest_source)
      VALUES ${values.join(",")}
    `);

    const { getVerificationRates } = await import("@/lib/agent-analytics/metrics");
    const { emitImpersonationTasks } = await import("@/lib/agent-analytics/task-emitter");

    const periodStart = new Date(now.getTime() - 86400_000);
    const rates = await getVerificationRates(OWNER_BRAND_ID, periodStart, now);

    const openai = rates.find((r: any) => r.vendor === "openai");
    expect(openai).toBeDefined();
    expect(openai!.total).toBeGreaterThanOrEqual(10);
    expect(openai!.unverifiedRate).toBeGreaterThan(25);

    // Now emit tasks — this exercises createTask against the real DB
    const emitted = await emitImpersonationTasks(
      { organizationId: OWNER_ORG_ID, brandId: OWNER_BRAND_ID },
      rates,
    );

    expect(emitted).toBeGreaterThan(0);

    // Verify the task was actually written to the DB
    const [task] = await pgClient`
      SELECT id, title, recommendation_key FROM remediation_tasks
      WHERE brand_id = ${OWNER_BRAND_ID}
        AND recommendation_key = 'investigate_impersonation'
    `;
    expect(task).toBeDefined();
    expect(task.title).toContain("unverified");
    expect(task.recommendation_key).toBe("investigate_impersonation");
  });

  it("does NOT emit when unverifiedRate ≤ 25%", async () => {
    const now = new Date();
    const recentTs = new Date(now.getTime() - 3600_000).toISOString();

    // 9 verified + 1 unverified = 10 total, 10% unverified (below threshold)
    const values = [];
    for (let i = 0; i < 9; i++) {
      values.push(`('${OWNER_BRAND_ID}', '${OWNER_ORG_ID}', 'GPTBot', 'must_allow', 'https://s2-test.local/ok${i}', 'indexing', 'verified', '${recentTs}'::timestamptz, '40.88.${i}.1', 'log_upload')`);
    }
    values.push(`('${OWNER_BRAND_ID}', '${OWNER_ORG_ID}', 'GPTBot', 'must_allow', 'https://s2-test.local/ok9', 'indexing', 'unverified', '${recentTs}'::timestamptz, '40.88.9.1', 'log_upload')`);

    await pgClient.unsafe(`
      INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, visit_purpose, verification_status, visited_at, source_ip, ingest_source)
      VALUES ${values.join(",")}
    `);

    const { getVerificationRates } = await import("@/lib/agent-analytics/metrics");
    const { emitImpersonationTasks } = await import("@/lib/agent-analytics/task-emitter");

    const periodStart = new Date(now.getTime() - 86400_000);
    const rates = await getVerificationRates(OWNER_BRAND_ID, periodStart, now);

    const emitted = await emitImpersonationTasks(
      { organizationId: OWNER_ORG_ID, brandId: OWNER_BRAND_ID },
      rates,
    );

    expect(emitted).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP 7 — lookupByUserAgent (DB-coupled, deferred from Section 1)
// ═══════════════════════════════════════════════════════════════════

describe("Step 7: lookupByUserAgent against real registry", () => {
  it("matches GPTBot substring in a full UA string", async () => {
    const { lookupByUserAgent, clearRegistryCache } = await import("@/lib/agent-analytics/bot-registry");
    clearRegistryCache();

    const result = await lookupByUserAgent(
      "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",
    );

    expect(result).not.toBeNull();
    expect(result!.uaToken).toBe("GPTBot");
    expect(result!.vendor).toBe("openai");
    expect(result!.crawlerTier).toBe("must_allow");
    expect(result!.defaultPurpose).toBe("indexing");
    expect(result!.isAgentUa).toBe(false);
  });

  it("returns null for unknown UA (no registry match)", async () => {
    const { lookupByUserAgent, clearRegistryCache } = await import("@/lib/agent-analytics/bot-registry");
    clearRegistryCache();

    const result = await lookupByUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
    );
    expect(result).toBeNull();
  });

  it("emits canon enum values (AA-C7 — crawler_tier/default_purpose from registry)", async () => {
    const { lookupByUserAgent, clearRegistryCache } = await import("@/lib/agent-analytics/bot-registry");
    clearRegistryCache();

    const result = await lookupByUserAgent("GPTBot/1.1");
    expect(result).not.toBeNull();

    const validTiers = ["must_allow", "emerging", "data"];
    const validPurposes = ["retrieval", "indexing", "training", null];
    expect(validTiers).toContain(result!.crawlerTier);
    expect(validPurposes).toContain(result!.defaultPurpose);
  });
});
