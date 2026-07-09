import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const ORG = "d3d3d3d3-0003-4000-a000-000000000001";
const BRAND = "d3d3d3d3-0003-4000-a000-000000000011";

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG}, 'ao-test', 'AO Test', 'ao-test') ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${BRAND}, ${ORG}, 'AO Brand', 'ao-test.example.com', 'tradies', 'au', ARRAY['VIC:Melbourne']) ON CONFLICT (id) DO NOTHING`;
  await client`DELETE FROM agent_readiness_scores WHERE brand_id = ${BRAND}`;
});

afterAll(async () => {
  await client`DELETE FROM agent_readiness_scores WHERE brand_id = ${BRAND}`.catch(() => {});
  await client`DELETE FROM brands WHERE id = ${BRAND}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${ORG}`.catch(() => {});
  await client.end();
});

describe("agent_readiness_scores — APPEND-ONLY (U-13, LLD 5475)", () => {
  it("two inserts produce 2 rows (not overwritten)", async () => {
    await client`
      INSERT INTO agent_readiness_scores (brand_id, organization_id, tech_score, total_score, scored_at)
      VALUES (${BRAND}, ${ORG}, 10, 40, '2026-07-01T00:00:00Z')
    `;
    await client`
      INSERT INTO agent_readiness_scores (brand_id, organization_id, tech_score, total_score, scored_at)
      VALUES (${BRAND}, ${ORG}, 15, 55, '2026-07-02T00:00:00Z')
    `;
    const rows = await client`SELECT * FROM agent_readiness_scores WHERE brand_id = ${BRAND}`;
    expect(rows.length).toBe(2);
  });

  it("latest via scored_at DESC returns the newer row", async () => {
    const [latest] = await client`
      SELECT total_score FROM agent_readiness_scores
      WHERE brand_id = ${BRAND}
      ORDER BY scored_at DESC LIMIT 1
    `;
    expect(latest.total_score).toBe(55);
  });
});
