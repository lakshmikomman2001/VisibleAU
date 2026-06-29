import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { configBundleCache } from "@/db/schema/config-bundle-cache";
import { marketAiBudgetPolicies } from "@/db/schema/market-ai-budget-policies";
import { samplingPolicies } from "@/db/schema/sampling-policies";
import { metricQualityGates } from "@/db/schema/metric-quality-gates";
import { promptPackCoverage } from "@/db/schema/prompt-pack-coverage";
import { providerMarketCapabilities } from "@/db/schema/provider-market-capabilities";
import { auditCostSnapshots } from "@/db/schema/audit-cost-snapshots";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client);
});

afterAll(async () => {
  await client.end();
});

describe("E2E: Sprint 1 platform tables exist in dev DB", () => {
  const expectedTables = [
    "config_bundle_cache",
    "market_ai_budget_policies",
    "sampling_policies",
    "metric_quality_gates",
    "prompt_pack_coverage",
    "provider_market_capabilities",
    "audit_cost_snapshots",
  ];

  for (const table of expectedTables) {
    it(`table ${table} exists`, async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${table}
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });
  }

  it("audits table has 4 Phase 2 columns", async () => {
    const cols = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'audits'
        AND column_name IN ('config_bundle_id', 'config_digest', 'estimated_cost_cents', 'quality_status')
      ORDER BY column_name
    `;
    expect(cols.map((c) => c.column_name)).toEqual([
      "config_bundle_id",
      "config_digest",
      "estimated_cost_cents",
      "quality_status",
    ]);
  });

  it("quality_status defaults to 'pending'", async () => {
    const result = await client`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'quality_status'
    `;
    expect(result[0].column_default).toContain("pending");
  });
});

describe("E2E: seed data in dev DB", () => {
  it("metric_quality_gates has 7 AU_EN rows", async () => {
    const rows = await db
      .select()
      .from(metricQualityGates)
      .where(eq(metricQualityGates.marketCode, "AU_EN"));
    expect(rows).toHaveLength(7);
  });

  it("metric_quality_gates has correct minimum_samples values", async () => {
    const rows = await db
      .select()
      .from(metricQualityGates)
      .where(eq(metricQualityGates.marketCode, "AU_EN"));
    const map = Object.fromEntries(rows.map((r) => [r.metricKey, r.minimumSamples]));
    expect(map.frequency).toBe(10);
    expect(map.sentiment).toBe(10);
    expect(map.accuracy).toBe(5);
    expect(map.position).toBe(10);
    expect(map.context).toBe(10);
    expect(map.composite).toBe(3);
    expect(map.citation_source).toBe(5);
  });

  it("provider_market_capabilities has 4 AU_EN providers", async () => {
    const rows = await db
      .select()
      .from(providerMarketCapabilities)
      .where(eq(providerMarketCapabilities.marketCode, "AU_EN"));
    expect(rows).toHaveLength(4);
  });

  it("all 4 providers are enabled", async () => {
    const rows = await db
      .select()
      .from(providerMarketCapabilities)
      .where(eq(providerMarketCapabilities.marketCode, "AU_EN"));
    for (const r of rows) {
      expect(r.isEnabled).toBe(true);
    }
  });

  it("anthropic supports_citations is FALSE in DB", async () => {
    const [row] = await db
      .select()
      .from(providerMarketCapabilities)
      .where(eq(providerMarketCapabilities.providerKey, "anthropic"));
    expect(row).toBeDefined();
    expect(row.supportsCitations).toBe(false);
  });

  it("perplexity supports_query_fan_out is FALSE in DB", async () => {
    const [row] = await db
      .select()
      .from(providerMarketCapabilities)
      .where(eq(providerMarketCapabilities.providerKey, "perplexity"));
    expect(row).toBeDefined();
    expect(row.supportsQueryFanOut).toBe(false);
  });
});

describe("E2E: RLS on audit_cost_snapshots", () => {
  it("RLS is enabled on audit_cost_snapshots", async () => {
    const result = await client`
      SELECT relrowsecurity FROM pg_class
      WHERE relname = 'audit_cost_snapshots'
    `;
    expect(result[0].relrowsecurity).toBe(true);
  });

  it("org_isolation policy exists on audit_cost_snapshots", async () => {
    const result = await client`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'audit_cost_snapshots'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.map((r) => r.policyname)).toContain("audit_cost_snapshots_org_policy");
  });

  it("RLS is NOT enabled on the 6 global config tables", async () => {
    const configTables = [
      "config_bundle_cache",
      "market_ai_budget_policies",
      "sampling_policies",
      "metric_quality_gates",
      "prompt_pack_coverage",
      "provider_market_capabilities",
    ];
    for (const table of configTables) {
      const result = await client`
        SELECT relrowsecurity FROM pg_class WHERE relname = ${table}
      `;
      expect(result[0].relrowsecurity).toBe(false);
    }
  });
});

describe("E2E: FK constraints", () => {
  it("audit_cost_snapshots.audit_id has ON DELETE CASCADE", async () => {
    const result = await client`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'audit_cost_snapshots'::regclass
        AND conname LIKE '%audit_id%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].confdeltype).toBe("c");
  });

  it("audit_cost_snapshots.budget_policy_id has ON DELETE SET NULL", async () => {
    const result = await client`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'audit_cost_snapshots'::regclass
        AND conname LIKE '%budget_policy%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].confdeltype).toBe("n");
  });
});

describe("E2E: unique constraints", () => {
  it("config_bundle_cache has the partial unique index config_bundle_one_active", async () => {
    const result = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'config_bundle_cache' AND indexname = 'config_bundle_one_active'
    `;
    expect(result).toHaveLength(1);
  });

  it("provider_market_capabilities has unique constraint on (provider_key, model_key, market_code, locale)", async () => {
    const result = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'provider_market_capabilities' AND indexdef LIKE '%UNIQUE%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe("E2E: MI-01 migration idempotency", () => {
  it("re-running the migration SQL does not error (IF NOT EXISTS)", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const migrationSql = readFileSync(
      resolve(__dirname, "../../../db/migrations/0010_phase2_sprint1_platform.sql"),
      "utf-8",
    );
    const statements = migrationSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await expect(client.unsafe(stmt)).resolves.not.toThrow();
    }
  });
});
