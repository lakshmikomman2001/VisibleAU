import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import postgres from "postgres";
import { auditCostSnapshots } from "@/db/schema/audit-cost-snapshots";
import { marketAiBudgetPolicies } from "@/db/schema/market-ai-budget-policies";
import { samplingPolicies } from "@/db/schema/sampling-policies";
import { promptPackCoverage } from "@/db/schema/prompt-pack-coverage";
import { providerMarketCapabilities } from "@/db/schema/provider-market-capabilities";
import { metricQualityGates } from "@/db/schema/metric-quality-gates";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

// Use an existing org/brand for FK tests — we only create+delete our own test rows
const TEST_ORG_ID = "b9eb6f41-3067-48e0-9711-a732c4a5a5dc"; // Sample Audit org
const TEST_BRAND_ID = "0605e30c-6bee-4c60-a29f-75eeed9eb0b4"; // bondiplumbing.com.au

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client);
});

afterAll(async () => {
  await client.end();
});

// ──────────────────────────────────────────────
// 1. RLS under non-superuser role
// ──────────────────────────────────────────────
describe("E2E: RLS posture under non-superuser role", () => {
  let rlsClient: ReturnType<typeof postgres>;
  const TEST_AUDIT_IDS: string[] = [];
  const TEST_SNAPSHOT_IDS: string[] = [];
  const ORG_A = TEST_ORG_ID;
  const ORG_B = "2b3baba3-195f-457d-9f4e-e6982f9f4c78"; // Test Org Free 3

  beforeAll(async () => {
    // Create rls_test_role if it doesn't exist
    await client`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role') THEN
          CREATE ROLE rls_test_role LOGIN PASSWORD 'rls_test_pass';
        END IF;
      END $$
    `;

    // Grant necessary permissions
    await client`GRANT USAGE ON SCHEMA public TO rls_test_role`;
    await client`GRANT SELECT, INSERT, UPDATE, DELETE ON audit_cost_snapshots TO rls_test_role`;
    await client`GRANT SELECT ON audits TO rls_test_role`;
    await client`GRANT SELECT ON organizations TO rls_test_role`;
    await client`GRANT SELECT ON market_ai_budget_policies TO rls_test_role`;

    // Create 2 test audits (one for each org)
    const [auditA] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines)
      VALUES (${TEST_BRAND_ID}, ${ORG_A}, 99901, ARRAY['chatgpt'])
      RETURNING id
    `;
    const [auditB] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines)
      VALUES (${TEST_BRAND_ID}, ${ORG_B}, 99902, ARRAY['chatgpt'])
      RETURNING id
    `;
    TEST_AUDIT_IDS.push(auditA.id, auditB.id);

    // Create cost snapshots for each org
    const [snapA] = await client`
      INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, estimated_cost_cents, actual_cost_cents)
      VALUES (${auditA.id}, ${ORG_A}, 'AU_EN', 'en-AU', 100, 90)
      RETURNING id
    `;
    const [snapB] = await client`
      INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, estimated_cost_cents, actual_cost_cents)
      VALUES (${auditB.id}, ${ORG_B}, 'AU_EN', 'en-AU', 200, 180)
      RETURNING id
    `;
    TEST_SNAPSHOT_IDS.push(snapA.id, snapB.id);

    // Connect as rls_test_role
    rlsClient = postgres(TEST_DB_URL.replace("postgres:password", "rls_test_role:rls_test_pass"), {
      max: 1,
    });
  });

  afterAll(async () => {
    // Clean up test data (as superuser)
    for (const id of TEST_SNAPSHOT_IDS) {
      await client`DELETE FROM audit_cost_snapshots WHERE id = ${id}`;
    }
    for (const id of TEST_AUDIT_IDS) {
      await client`DELETE FROM audits WHERE id = ${id}`;
    }
    if (rlsClient) await rlsClient.end();
  });

  it("non-superuser with app.current_org_id set sees only matching org rows", async () => {
    const rows = await rlsClient`
      SELECT set_config('app.current_org_id', ${ORG_A}, false);
    `.then(() =>
      rlsClient`SELECT id, organization_id FROM audit_cost_snapshots WHERE id = ANY(${TEST_SNAPSHOT_IDS})`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(ORG_A);
  });

  it("non-superuser with app.current_org_id for ORG_B sees only ORG_B rows", async () => {
    const rows = await rlsClient`
      SELECT set_config('app.current_org_id', ${ORG_B}, false);
    `.then(() =>
      rlsClient`SELECT id, organization_id FROM audit_cost_snapshots WHERE id = ANY(${TEST_SNAPSHOT_IDS})`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(ORG_B);
  });

  it("non-superuser with unset app.current_org_id sees 0 rows", async () => {
    const rows = await rlsClient`
      SELECT set_config('app.current_org_id', '00000000-0000-0000-0000-000000000000', false);
    `.then(() =>
      rlsClient`SELECT id FROM audit_cost_snapshots WHERE id = ANY(${TEST_SNAPSHOT_IDS})`,
    );
    expect(rows).toHaveLength(0);
  });

  it("superuser (postgres) bypasses RLS — sees all rows", async () => {
    const rows = await client`
      SELECT id FROM audit_cost_snapshots WHERE id = ANY(${TEST_SNAPSHOT_IDS})
    `;
    expect(rows).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────
// 2. FK CASCADE: audit → audit_cost_snapshots
// ──────────────────────────────────────────────
describe("E2E: FK CASCADE — deleting audit cascades to audit_cost_snapshots", () => {
  let cascadeAuditId: string;
  let cascadeSnapshotId: string;

  beforeAll(async () => {
    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 99903, ARRAY['chatgpt'])
      RETURNING id
    `;
    cascadeAuditId = audit.id;

    const [snap] = await client`
      INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale)
      VALUES (${cascadeAuditId}, ${TEST_ORG_ID}, 'AU_EN', 'en-AU')
      RETURNING id
    `;
    cascadeSnapshotId = snap.id;
  });

  afterAll(async () => {
    // Safety cleanup in case test fails midway
    await client`DELETE FROM audit_cost_snapshots WHERE id = ${cascadeSnapshotId}`.catch(() => {});
    await client`DELETE FROM audits WHERE id = ${cascadeAuditId}`.catch(() => {});
  });

  it("snapshot exists before delete", async () => {
    const rows = await client`SELECT id FROM audit_cost_snapshots WHERE id = ${cascadeSnapshotId}`;
    expect(rows).toHaveLength(1);
  });

  it("deleting audit cascades to snapshot", async () => {
    await client`DELETE FROM audits WHERE id = ${cascadeAuditId}`;
    const rows = await client`SELECT id FROM audit_cost_snapshots WHERE id = ${cascadeSnapshotId}`;
    expect(rows).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// 3. FK SET NULL: budget_policy → audit_cost_snapshots
// ──────────────────────────────────────────────
describe("E2E: FK SET NULL — deleting budget policy nulls snapshot reference", () => {
  let setNullPolicyId: string;
  let setNullAuditId: string;
  let setNullSnapshotId: string;

  beforeAll(async () => {
    // Create a test budget policy
    const [policy] = await client`
      INSERT INTO market_ai_budget_policies (market_code, segment, use_case)
      VALUES ('TEST_FK', 'smb', 'fk_test')
      RETURNING id
    `;
    setNullPolicyId = policy.id;

    // Create a test audit
    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 99904, ARRAY['chatgpt'])
      RETURNING id
    `;
    setNullAuditId = audit.id;

    // Create snapshot referencing the policy
    const [snap] = await client`
      INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, budget_policy_id)
      VALUES (${setNullAuditId}, ${TEST_ORG_ID}, 'AU_EN', 'en-AU', ${setNullPolicyId})
      RETURNING id
    `;
    setNullSnapshotId = snap.id;
  });

  afterAll(async () => {
    await client`DELETE FROM audit_cost_snapshots WHERE id = ${setNullSnapshotId}`.catch(() => {});
    await client`DELETE FROM audits WHERE id = ${setNullAuditId}`.catch(() => {});
    await client`DELETE FROM market_ai_budget_policies WHERE market_code = 'TEST_FK'`.catch(() => {});
  });

  it("snapshot references policy before delete", async () => {
    const [row] = await client`
      SELECT budget_policy_id FROM audit_cost_snapshots WHERE id = ${setNullSnapshotId}
    `;
    expect(row.budget_policy_id).toBe(setNullPolicyId);
  });

  it("deleting policy sets snapshot.budget_policy_id to NULL", async () => {
    await client`DELETE FROM market_ai_budget_policies WHERE id = ${setNullPolicyId}`;
    const [row] = await client`
      SELECT budget_policy_id FROM audit_cost_snapshots WHERE id = ${setNullSnapshotId}
    `;
    expect(row.budget_policy_id).toBeNull();
  });
});

// ──────────────────────────────────────────────
// 4. Unique constraints on remaining tables
// ──────────────────────────────────────────────
describe("E2E: UNIQUE constraints on sampling_policies", () => {
  afterAll(async () => {
    await client`DELETE FROM sampling_policies WHERE market_code = 'TEST_UQ'`;
  });

  it("rejects duplicate (market_code, segment, use_case)", async () => {
    await client`
      INSERT INTO sampling_policies (market_code, segment, use_case)
      VALUES ('TEST_UQ', 'smb', 'brand_audit')
    `;
    await expect(
      client`INSERT INTO sampling_policies (market_code, segment, use_case) VALUES ('TEST_UQ', 'smb', 'brand_audit')`,
    ).rejects.toThrow();
  });

  it("allows different use_case for the same market+segment", async () => {
    const [row] = await client`
      INSERT INTO sampling_policies (market_code, segment, use_case)
      VALUES ('TEST_UQ', 'smb', 'competitor_audit')
      RETURNING id
    `;
    expect(row.id).toBeDefined();
  });
});

describe("E2E: UNIQUE constraints on prompt_pack_coverage", () => {
  afterAll(async () => {
    await client`DELETE FROM prompt_pack_coverage WHERE market_code = 'TEST_UQ'`;
  });

  it("rejects duplicate (market_code, locale, segment, use_case)", async () => {
    await client`
      INSERT INTO prompt_pack_coverage (market_code, locale, segment, use_case, required_template_keys, available_template_keys, coverage_ratio, coverage_status)
      VALUES ('TEST_UQ', 'en-AU', 'smb', 'brand_audit', '["k1"]'::jsonb, '["k1"]'::jsonb, '1.00', 'full')
    `;
    await expect(
      client`
        INSERT INTO prompt_pack_coverage (market_code, locale, segment, use_case, required_template_keys, available_template_keys, coverage_ratio, coverage_status)
        VALUES ('TEST_UQ', 'en-AU', 'smb', 'brand_audit', '["k2"]'::jsonb, '["k2"]'::jsonb, '0.50', 'partial')
      `,
    ).rejects.toThrow();
  });
});

describe("E2E: UNIQUE constraints on provider_market_capabilities", () => {
  afterAll(async () => {
    await client`DELETE FROM provider_market_capabilities WHERE market_code = 'TEST_UQ'`;
  });

  it("rejects duplicate (provider_key, model_key, market_code, locale)", async () => {
    await client`
      INSERT INTO provider_market_capabilities (provider_key, model_key, market_code, locale)
      VALUES ('test_provider', 'test_model', 'TEST_UQ', 'en-XX')
    `;
    await expect(
      client`
        INSERT INTO provider_market_capabilities (provider_key, model_key, market_code, locale)
        VALUES ('test_provider', 'test_model', 'TEST_UQ', 'en-XX')
      `,
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// 5. Budget policy seed data verification
// ──────────────────────────────────────────────
describe("E2E: budget policy seed data", () => {
  it("AU_EN smb brand_audit policy has correct values", async () => {
    const [row] = await client`
      SELECT max_estimated_cost_cents, hard_stop_on_budget, max_prompts_per_audit, max_models_per_audit
      FROM market_ai_budget_policies
      WHERE market_code = 'AU_EN' AND segment = 'smb' AND use_case = 'brand_audit'
    `;
    expect(row).toBeDefined();
    expect(row.max_estimated_cost_cents).toBe(550);
    expect(row.hard_stop_on_budget).toBe(true);
    expect(row.max_prompts_per_audit).toBe(50);
    expect(row.max_models_per_audit).toBe(4);
  });
});

// ──────────────────────────────────────────────
// 6. Service query simulation against real DB
// ──────────────────────────────────────────────
describe("E2E: service queries against real DB", () => {
  describe("ProviderCapabilityRegistry.getEnabledProviders equivalent", () => {
    it("returns 4 enabled AU_EN providers", async () => {
      const rows = await db
        .select()
        .from(providerMarketCapabilities)
        .where(
          and(
            eq(providerMarketCapabilities.marketCode, "AU_EN"),
            eq(providerMarketCapabilities.locale, "en-AU"),
            eq(providerMarketCapabilities.isEnabled, true),
          ),
        );
      expect(rows).toHaveLength(4);
    });

    it("all providers have expected keys", async () => {
      const rows = await db
        .select({ providerKey: providerMarketCapabilities.providerKey })
        .from(providerMarketCapabilities)
        .where(
          and(
            eq(providerMarketCapabilities.marketCode, "AU_EN"),
            eq(providerMarketCapabilities.isEnabled, true),
          ),
        );
      const keys = rows.map((r) => r.providerKey).sort();
      expect(keys).toEqual(["anthropic", "google", "openai", "perplexity"]);
    });

    it("perplexity does NOT support fan-out", async () => {
      const [row] = await db
        .select({ supportsQueryFanOut: providerMarketCapabilities.supportsQueryFanOut })
        .from(providerMarketCapabilities)
        .where(
          and(
            eq(providerMarketCapabilities.providerKey, "perplexity"),
            eq(providerMarketCapabilities.marketCode, "AU_EN"),
          ),
        );
      expect(row.supportsQueryFanOut).toBe(false);
    });
  });

  describe("BudgetPolicyService.estimate equivalent", () => {
    it("finds the AU_EN budget policy with maxAllowedCents=550", async () => {
      const [policy] = await db
        .select()
        .from(marketAiBudgetPolicies)
        .where(
          and(
            eq(marketAiBudgetPolicies.marketCode, "AU_EN"),
            eq(marketAiBudgetPolicies.segment, "smb"),
            eq(marketAiBudgetPolicies.useCase, "brand_audit"),
          ),
        );
      expect(policy).toBeDefined();
      expect(policy.maxEstimatedCostCents).toBe(550);
    });
  });

  describe("QualityGateService.evaluate equivalent", () => {
    it("finds 7 AU_EN quality gates", async () => {
      const gates = await db
        .select()
        .from(metricQualityGates)
        .where(eq(metricQualityGates.marketCode, "AU_EN"));
      expect(gates).toHaveLength(7);
    });

    it("frequency gate requires 10 samples and 2 providers", async () => {
      const [gate] = await db
        .select()
        .from(metricQualityGates)
        .where(
          and(
            eq(metricQualityGates.marketCode, "AU_EN"),
            eq(metricQualityGates.metricKey, "frequency"),
          ),
        );
      expect(gate.minimumSamples).toBe(10);
      expect(gate.minimumProviderCount).toBe(2);
    });
  });
});

// ──────────────────────────────────────────────
// 7. NOT NULL constraint enforcement
// ──────────────────────────────────────────────
describe("E2E: NOT NULL constraints", () => {
  it("audit_cost_snapshots rejects null audit_id", async () => {
    await expect(
      client`
        INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale)
        VALUES (NULL, ${TEST_ORG_ID}, 'AU_EN', 'en-AU')
      `,
    ).rejects.toThrow();
  });

  it("audit_cost_snapshots rejects null organization_id", async () => {
    await expect(
      client`
        INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale)
        VALUES (gen_random_uuid(), NULL, 'AU_EN', 'en-AU')
      `,
    ).rejects.toThrow();
  });

  it("metric_quality_gates rejects null minimum_samples", async () => {
    await expect(
      client`
        INSERT INTO metric_quality_gates (metric_key, market_code, minimum_samples)
        VALUES ('test_null', 'TEST_NULL', NULL)
      `,
    ).rejects.toThrow();
  });

  it("market_ai_budget_policies rejects null market_code", async () => {
    await expect(
      client`
        INSERT INTO market_ai_budget_policies (market_code, segment, use_case)
        VALUES (NULL, 'smb', 'brand_audit')
      `,
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// 8. Default values
// ──────────────────────────────────────────────
describe("E2E: default values on audit_cost_snapshots", () => {
  let defaultsAuditId: string;
  let defaultsSnapshotId: string;

  beforeAll(async () => {
    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 99905, ARRAY['chatgpt'])
      RETURNING id
    `;
    defaultsAuditId = audit.id;

    const [snap] = await client`
      INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale)
      VALUES (${defaultsAuditId}, ${TEST_ORG_ID}, 'AU_EN', 'en-AU')
      RETURNING *
    `;
    defaultsSnapshotId = snap.id;
  });

  afterAll(async () => {
    await client`DELETE FROM audit_cost_snapshots WHERE id = ${defaultsSnapshotId}`.catch(() => {});
    await client`DELETE FROM audits WHERE id = ${defaultsAuditId}`.catch(() => {});
  });

  it("estimated_cost_cents defaults to 0", async () => {
    const [row] = await client`
      SELECT estimated_cost_cents FROM audit_cost_snapshots WHERE id = ${defaultsSnapshotId}
    `;
    expect(row.estimated_cost_cents).toBe(0);
  });

  it("actual_cost_cents defaults to 0", async () => {
    const [row] = await client`
      SELECT actual_cost_cents FROM audit_cost_snapshots WHERE id = ${defaultsSnapshotId}
    `;
    expect(row.actual_cost_cents).toBe(0);
  });

  it("prompt_count defaults to 0", async () => {
    const [row] = await client`
      SELECT prompt_count FROM audit_cost_snapshots WHERE id = ${defaultsSnapshotId}
    `;
    expect(row.prompt_count).toBe(0);
  });

  it("provider_call_count defaults to 0", async () => {
    const [row] = await client`
      SELECT provider_call_count FROM audit_cost_snapshots WHERE id = ${defaultsSnapshotId}
    `;
    expect(row.provider_call_count).toBe(0);
  });

  it("budget_policy_id defaults to null", async () => {
    const [row] = await client`
      SELECT budget_policy_id FROM audit_cost_snapshots WHERE id = ${defaultsSnapshotId}
    `;
    expect(row.budget_policy_id).toBeNull();
  });

  it("created_at is auto-populated", async () => {
    const [row] = await client`
      SELECT created_at FROM audit_cost_snapshots WHERE id = ${defaultsSnapshotId}
    `;
    expect(row.created_at).toBeDefined();
    expect(typeof row.created_at === "string" || row.created_at instanceof Date).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 9. PASS 2 — RLS INSERT/UPDATE enforcement
// ──────────────────────────────────────────────
describe("E2E: RLS INSERT enforcement under non-superuser", () => {
  let rlsClient2: ReturnType<typeof postgres>;
  let p2AuditId: string;

  beforeAll(async () => {
    // Ensure role exists (idempotent)
    await client`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role') THEN
          CREATE ROLE rls_test_role LOGIN PASSWORD 'rls_test_pass';
        END IF;
      END $$
    `;
    await client`GRANT USAGE ON SCHEMA public TO rls_test_role`;
    await client`GRANT SELECT, INSERT, UPDATE, DELETE ON audit_cost_snapshots TO rls_test_role`;

    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 99906, ARRAY['chatgpt'])
      RETURNING id
    `;
    p2AuditId = audit.id;

    rlsClient2 = postgres(TEST_DB_URL.replace("postgres:password", "rls_test_role:rls_test_pass"), {
      max: 1,
    });
  });

  afterAll(async () => {
    if (rlsClient2) await rlsClient2.end();
    await client`DELETE FROM audit_cost_snapshots WHERE audit_id = ${p2AuditId}`.catch(() => {});
    await client`DELETE FROM audits WHERE id = ${p2AuditId}`.catch(() => {});
  });

  it("INSERT allowed when app.current_org_id matches row org", async () => {
    await rlsClient2`SELECT set_config('app.current_org_id', ${TEST_ORG_ID}, false)`;
    const [row] = await rlsClient2`
      INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale)
      VALUES (${p2AuditId}, ${TEST_ORG_ID}, 'AU_EN', 'en-AU')
      RETURNING id
    `;
    expect(row.id).toBeDefined();
  });

  it("INSERT blocked when app.current_org_id does NOT match row org", async () => {
    const OTHER_ORG = "2b3baba3-195f-457d-9f4e-e6982f9f4c78";
    await rlsClient2`SELECT set_config('app.current_org_id', ${OTHER_ORG}, false)`;
    await expect(
      rlsClient2`
        INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale)
        VALUES (${p2AuditId}, ${TEST_ORG_ID}, 'AU_EN', 'en-AU')
      `,
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// 10. PASS 2 — FK orphan rejection
// ──────────────────────────────────────────────
describe("E2E: FK orphan rejection", () => {
  it("audit_cost_snapshots rejects non-existent audit_id", async () => {
    const fakeAuditId = "00000000-0000-0000-0000-000000000001";
    await expect(
      client`
        INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale)
        VALUES (${fakeAuditId}, ${TEST_ORG_ID}, 'AU_EN', 'en-AU')
      `,
    ).rejects.toThrow();
  });

  it("audit_cost_snapshots rejects non-existent organization_id", async () => {
    await expect(
      client`
        INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'AU_EN', 'en-AU')
      `,
    ).rejects.toThrow();
  });

  it("audit_cost_snapshots rejects non-existent budget_policy_id", async () => {
    const [audit] = await client`
      INSERT INTO audits (brand_id, organization_id, audit_number, engines)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 99907, ARRAY['chatgpt'])
      RETURNING id
    `;
    await expect(
      client`
        INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, budget_policy_id)
        VALUES (${audit.id}, ${TEST_ORG_ID}, 'AU_EN', 'en-AU', '00000000-0000-0000-0000-000000000003')
      `,
    ).rejects.toThrow();
    await client`DELETE FROM audits WHERE id = ${audit.id}`;
  });
});

// ──────────────────────────────────────────────
// 11. PASS 2 — Index verification
// ──────────────────────────────────────────────
describe("E2E: indexes on platform tables", () => {
  it("audit_cost_org_created_idx exists", async () => {
    const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'audit_cost_snapshots' AND indexname = 'audit_cost_org_created_idx'
    `;
    expect(rows).toHaveLength(1);
  });

  it("audit_cost_audit_id_idx exists", async () => {
    const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'audit_cost_snapshots' AND indexname = 'audit_cost_audit_id_idx'
    `;
    expect(rows).toHaveLength(1);
  });

  it("budget_policy unique index exists", async () => {
    const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'market_ai_budget_policies' AND indexname = 'market_ai_budget_policies_market_code_segment_use_case_key'
    `;
    expect(rows).toHaveLength(1);
  });

  it("sampling_policy unique index exists", async () => {
    const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'sampling_policies' AND indexname = 'sampling_policies_market_code_segment_use_case_key'
    `;
    expect(rows).toHaveLength(1);
  });

  it("metric_quality_gate unique index exists", async () => {
    const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'metric_quality_gates' AND indexname = 'metric_quality_gates_metric_key_market_code_key'
    `;
    expect(rows).toHaveLength(1);
  });

  it("prompt_pack_coverage unique index exists", async () => {
    const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'prompt_pack_coverage' AND indexname = 'prompt_pack_coverage_market_code_locale_segment_use_case_key'
    `;
    expect(rows).toHaveLength(1);
  });

  it("provider_capability unique index exists", async () => {
    const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'provider_market_capabilities' AND indexname = 'provider_market_capabilities_provider_key_model_key_market__key'
    `;
    expect(rows).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────
// 12. PASS 2 — Provider capability data integrity
// ──────────────────────────────────────────────
describe("E2E: provider capability data integrity", () => {
  it("openai supports web retrieval", async () => {
    const [row] = await client`
      SELECT supports_web_retrieval FROM provider_market_capabilities
      WHERE provider_key = 'openai' AND market_code = 'AU_EN'
    `;
    expect(row.supports_web_retrieval).toBe(true);
  });

  it("anthropic does NOT support citations in dev DB", async () => {
    const [row] = await client`
      SELECT supports_citations FROM provider_market_capabilities
      WHERE provider_key = 'anthropic' AND market_code = 'AU_EN'
    `;
    expect(row.supports_citations).toBe(false);
  });

  it("average_latency_ms is nullable (not seeded)", async () => {
    const rows = await client`
      SELECT provider_key, average_latency_ms FROM provider_market_capabilities
      WHERE market_code = 'AU_EN' AND is_enabled = true
    `;
    expect(rows).toHaveLength(4);
    // Latency is nullable in schema — seed data may not populate it
    for (const r of rows) {
      expect(r.average_latency_ms === null || typeof r.average_latency_ms === "number").toBe(true);
    }
  });

  it("all quality gates have insufficient_data_label defaulting to 'Insufficient data'", async () => {
    const rows = await client`
      SELECT insufficient_data_label FROM metric_quality_gates
      WHERE market_code = 'AU_EN'
    `;
    for (const r of rows) {
      expect(r.insufficient_data_label).toBe("Insufficient data");
    }
  });
});

// ──────────────────────────────────────────────
// PASS 3 — Cross-sprint E2E wiring
// ──────────────────────────────────────────────
describe("E2E: cross-sprint wiring — DB state matches service assumptions", () => {
  it("budget policy marketCode=AU_EN exists (BudgetPolicyService.estimate hardcodes 'AU_EN')", async () => {
    const rows = await client`
      SELECT id FROM market_ai_budget_policies
      WHERE market_code = 'AU_EN' AND segment = 'smb' AND use_case = 'brand_audit'
    `;
    expect(rows).toHaveLength(1);
  });

  it("quality gates exist for all 5 DIMENSION_METRICS + composite + citation_source", async () => {
    const rows = await client`
      SELECT metric_key FROM metric_quality_gates WHERE market_code = 'AU_EN'
    `;
    const keys = rows.map((r: { metric_key: string }) => r.metric_key).sort();
    expect(keys).toEqual(
      ["accuracy", "citation_source", "composite", "context", "frequency", "position", "sentiment"],
    );
  });

  it("audits.quality_status column exists with default 'pending' (QualityGateService writes here)", async () => {
    const [col] = await client`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'quality_status'
    `;
    expect(col.column_default).toContain("pending");
  });

  it("audits.estimated_cost_cents column exists (BudgetPolicyService.record reads it)", async () => {
    const [col] = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'estimated_cost_cents'
    `;
    expect(col).toBeDefined();
  });

  it("provider_market_capabilities locale = 'en-AU' matches getBestProvider hardcoded locale", async () => {
    const rows = await client`
      SELECT DISTINCT locale FROM provider_market_capabilities WHERE market_code = 'AU_EN'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].locale).toBe("en-AU");
  });
});
