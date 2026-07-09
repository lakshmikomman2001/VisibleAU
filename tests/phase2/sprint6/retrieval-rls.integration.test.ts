import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const ORG_A = "d5d5d5d5-0005-4000-a000-000000000001";
const ORG_B = "d5d5d5d5-0005-4000-b000-000000000002";
const BRAND_A = "d5d5d5d5-0005-4000-a000-000000000011";
const BRAND_B = "d5d5d5d5-0005-4000-b000-000000000012";

const TABLES = [
  "crawler_visit_logs",
  "content_structure_audits",
  "llmstxt_versions",
  "agent_readiness_scores",
] as const;

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });

  await client.unsafe(`
    DO $$ BEGIN
      CREATE ROLE rls_test_role NOSUPERUSER NOBYPASSRLS LOGIN PASSWORD 'rls_test_password';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  for (const table of TABLES) {
    await client.unsafe(`GRANT SELECT, INSERT ON ${table} TO rls_test_role`).catch(() => {});
  }
  await client.unsafe(`GRANT USAGE ON SCHEMA public TO rls_test_role`).catch(() => {});

  for (const [org, brand, slug] of [
    [ORG_A, BRAND_A, "rls-a"],
    [ORG_B, BRAND_B, "rls-b"],
  ] as const) {
    await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${org}, ${slug}, ${slug}, ${slug}) ON CONFLICT (id) DO NOTHING`;
    await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${brand}, ${org}, ${slug}, ${slug + '.example.com'}, 'tradies', 'au', ARRAY['VIC:Melbourne']) ON CONFLICT (id) DO NOTHING`;
  }

  await client`INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, is_active_agent, visited_at) VALUES (${BRAND_A}, ${ORG_A}, 'GPTBot', 'must_allow', 'https://a.com/p', false, now())`;
  await client`INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url, is_active_agent, visited_at) VALUES (${BRAND_B}, ${ORG_B}, 'GPTBot', 'must_allow', 'https://b.com/p', false, now())`;

  await client`INSERT INTO content_structure_audits (brand_id, organization_id, page_url) VALUES (${BRAND_A}, ${ORG_A}, 'https://a.com/about') ON CONFLICT (brand_id, page_url) DO NOTHING`;
  await client`INSERT INTO content_structure_audits (brand_id, organization_id, page_url) VALUES (${BRAND_B}, ${ORG_B}, 'https://b.com/about') ON CONFLICT (brand_id, page_url) DO NOTHING`;

  await client`INSERT INTO llmstxt_versions (brand_id, organization_id, content, depth_score, is_current) VALUES (${BRAND_A}, ${ORG_A}, 'a', 5, true)`;
  await client`INSERT INTO llmstxt_versions (brand_id, organization_id, content, depth_score, is_current) VALUES (${BRAND_B}, ${ORG_B}, 'b', 5, true)`;

  await client`INSERT INTO agent_readiness_scores (brand_id, organization_id, total_score) VALUES (${BRAND_A}, ${ORG_A}, 40)`;
  await client`INSERT INTO agent_readiness_scores (brand_id, organization_id, total_score) VALUES (${BRAND_B}, ${ORG_B}, 60)`;
});

afterAll(async () => {
  for (const table of [...TABLES].reverse()) {
    for (const brand of [BRAND_A, BRAND_B]) {
      await client.unsafe(`DELETE FROM ${table} WHERE brand_id = $1`, [brand]).catch(() => {});
    }
  }
  await client`DELETE FROM brands WHERE id IN (${BRAND_A}, ${BRAND_B})`.catch(() => {});
  await client`DELETE FROM organizations WHERE id IN (${ORG_A}, ${ORG_B})`.catch(() => {});
  await client.end();
});

describe("Sprint 6 RLS — cross-org isolation (LLD 5620, §5.6)", () => {
  it("org A cannot read org B rows on all 4 tables (DIRECT organization_id)", async () => {
    await client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE rls_test_role");
      await tx`SELECT set_config('app.current_org_id', ${ORG_A}, true)`;

      for (const table of TABLES) {
        const rows = await tx.unsafe(
          `SELECT * FROM ${table} WHERE organization_id = $1`,
          [ORG_B],
        );
        expect(rows.length).toBe(0);
      }
    });
  });

  it("org A CAN read own rows", async () => {
    await client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE rls_test_role");
      await tx`SELECT set_config('app.current_org_id', ${ORG_A}, true)`;

      for (const table of TABLES) {
        const rows = await tx.unsafe(
          `SELECT * FROM ${table} WHERE organization_id = $1`,
          [ORG_A],
        );
        expect(rows.length).toBeGreaterThan(0);
      }
    });
  });

  it("without setRlsContext (no app.current_org_id), no rows visible", async () => {
    await client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE rls_test_role");

      for (const table of TABLES) {
        const rows = await tx.unsafe(`SELECT * FROM ${table}`);
        expect(rows.length).toBe(0);
      }
    });
  });

  it("superuser bypasses RLS (proves RLS is the isolation mechanism)", async () => {
    for (const table of TABLES) {
      const rows = await client.unsafe(`SELECT * FROM ${table} WHERE organization_id = $1`, [ORG_B]);
      expect(rows.length).toBeGreaterThan(0);
    }
  });
});
