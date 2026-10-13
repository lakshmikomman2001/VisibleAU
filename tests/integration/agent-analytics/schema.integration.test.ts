import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDevDatabase, createClient, TEST_DB_URL } from "./_fixtures";

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = createClient();
  await assertDevDatabase(client);
});

afterAll(async () => {
  await client.end();
});

// ── Group E: Schema / migration presence ──

describe("E1: AA tables and columns exist", () => {
  it("crawler_visit_logs has source_ip, verification_status, verified_via, bytes, ingest_source", async () => {
    const cols = await client<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'crawler_visit_logs'
        AND column_name IN ('source_ip', 'verification_status', 'verified_via', 'bytes', 'ingest_source')
      ORDER BY column_name
    `;
    const names = cols.map((r) => r.column_name).sort();
    expect(names).toEqual([
      "bytes",
      "ingest_source",
      "source_ip",
      "verification_status",
      "verified_via",
    ]);
  });

  it("ai_bot_registry table exists", async () => {
    const [row] = await client`
      SELECT 1 AS exists FROM information_schema.tables
      WHERE table_name = 'ai_bot_registry'
    `;
    expect(row?.exists).toBe(1);
  });

  it("ai_bot_ip_ranges table exists", async () => {
    const [row] = await client`
      SELECT 1 AS exists FROM information_schema.tables
      WHERE table_name = 'ai_bot_ip_ranges'
    `;
    expect(row?.exists).toBe(1);
  });

  it("ai_referral_hits table exists", async () => {
    const [row] = await client`
      SELECT 1 AS exists FROM information_schema.tables
      WHERE table_name = 'ai_referral_hits'
    `;
    expect(row?.exists).toBe(1);
  });
});

describe("E2: source_ip is INET and cidr is CIDR (locks FIX-01)", () => {
  it("crawler_visit_logs.source_ip data_type = inet", async () => {
    const [row] = await client`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'crawler_visit_logs' AND column_name = 'source_ip'
    `;
    expect(row.data_type).toBe("inet");
  });

  it("ai_bot_ip_ranges.cidr data_type = cidr", async () => {
    const [row] = await client`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'ai_bot_ip_ranges' AND column_name = 'cidr'
    `;
    expect(row.data_type).toBe("cidr");
  });
});

describe("E3: RLS state — assert reality (enabled, not forced)", () => {
  // KNOWN (Finding #2): RLS is ENABLED not FORCED; the app connects as superuser and bypasses
  // RLS. assertBrandAccess is the enforced boundary. Tracked for the pre-GTM security pass —
  // do NOT "fix" by forcing RLS here (product-wide change).

  it("ai_referral_hits has RLS enabled", async () => {
    const [row] = await client`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'ai_referral_hits'
    `;
    expect(row.relrowsecurity).toBe(true);
  });

  // Task #46 (7th follow-up): migration 0029_rls_full_tenant_isolation.sql
  // deliberately DROPs the single combined ai_referral_hits_org_isolation
  // policy this test was written against, replacing it with four
  // per-operation policies (_org_select/_org_insert/_org_update/_org_delete)
  // for more granular control. This test predates that migration and was
  // never updated -- it isn't that isolation is missing, just that the
  // policy name/shape changed.
  it("ai_referral_hits has per-operation org-isolation policies (select/insert/update/delete)", async () => {
    const policies = await client<{ polname: string }[]>`
      SELECT polname FROM pg_policy
      WHERE polrelid = (SELECT oid FROM pg_class WHERE relname = 'ai_referral_hits')
    `;
    const names = policies.map((r) => r.polname);
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(names).toContain(`ai_referral_hits_org_${op}`);
    }
  });

  it("ai_bot_registry has NO org-isolation policy (global reference table)", async () => {
    const policies = await client`
      SELECT polname FROM pg_policy
      WHERE polrelid = (SELECT oid FROM pg_class WHERE relname = 'ai_bot_registry')
    `;
    expect(policies).toHaveLength(0);
  });

  it("ai_bot_ip_ranges has NO org-isolation policy (global reference table)", async () => {
    const policies = await client`
      SELECT polname FROM pg_policy
      WHERE polrelid = (SELECT oid FROM pg_class WHERE relname = 'ai_bot_ip_ranges')
    `;
    expect(policies).toHaveLength(0);
  });
});
