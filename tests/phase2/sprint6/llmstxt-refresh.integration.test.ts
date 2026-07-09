import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const ORG = "d2d2d2d2-0002-4000-a000-000000000001";
const BRAND = "d2d2d2d2-0002-4000-a000-000000000011";

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG}, 'lr-test', 'LR Test', 'lr-test') ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${BRAND}, ${ORG}, 'LR Brand', 'lr-test.example.com', 'tradies', 'au', ARRAY['VIC:Melbourne']) ON CONFLICT (id) DO NOTHING`;
  await client`DELETE FROM llmstxt_versions WHERE brand_id = ${BRAND}`;
});

afterAll(async () => {
  await client`DELETE FROM llmstxt_versions WHERE brand_id = ${BRAND}`.catch(() => {});
  await client`DELETE FROM brands WHERE id = ${BRAND}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${ORG}`.catch(() => {});
  await client.end();
});

describe("llmstxt one-current-per-brand (LLD 5380)", () => {
  it("after two refreshes, exactly 1 is_current=true", async () => {
    await client`
      INSERT INTO llmstxt_versions (brand_id, organization_id, content, depth_score, is_current)
      VALUES (${BRAND}, ${ORG}, 'v1 content', 8, true)
    `;

    await client`UPDATE llmstxt_versions SET is_current = false WHERE brand_id = ${BRAND} AND is_current = true`;
    await client`
      INSERT INTO llmstxt_versions (brand_id, organization_id, content, depth_score, is_current)
      VALUES (${BRAND}, ${ORG}, 'v2 content', 12, true)
    `;

    const [{ count }] = await client`
      SELECT count(*)::int AS count FROM llmstxt_versions
      WHERE brand_id = ${BRAND} AND is_current = true
    `;
    expect(count).toBe(1);
  });

  it("re-break: skip demote → partial unique index rejects second is_current=true", async () => {
    let threw = false;
    try {
      await client`
        INSERT INTO llmstxt_versions (brand_id, organization_id, content, depth_score, is_current)
        VALUES (${BRAND}, ${ORG}, 'v3 BAD', 5, true)
      `;
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
