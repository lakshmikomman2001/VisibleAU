import postgres from "postgres";

export const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

export const TEST_ORG_ID = "a0a0a0a0-a3a1-4000-a000-000000000001";
export const TEST_BRAND_ID = "a0a0a0a0-a3a1-4000-a000-000000000011";
export const TEST_DOMAIN = "p3s1-integration-test.local";
export const TEST_ORG_NAME = "P3S1 Integration Test Org";

export function createClient() {
  return postgres(TEST_DB_URL, { max: 1 });
}

export async function assertDevDatabase(client: ReturnType<typeof postgres>) {
  const [row] = await client`SELECT current_database() AS db`;
  if (row.db !== "visibleau") {
    throw new Error(`SAFETY: expected dev database 'visibleau', got '${row.db}'`);
  }
}

export async function seedOrgAndBrand(client: ReturnType<typeof postgres>) {
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${TEST_ORG_ID}, 'p3s1-int-test', ${TEST_ORG_NAME}, 'p3s1-int-test')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'P3S1 Test Brand', ${TEST_DOMAIN}, 'tradies', 'au', ARRAY['VIC:Melbourne'])
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function cleanupAll(client: ReturnType<typeof postgres>) {
  await client`DELETE FROM crawler_visit_logs WHERE brand_id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM ai_referral_hits WHERE brand_id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM brands WHERE id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
}

export async function cleanupTestIpRanges(client: ReturnType<typeof postgres>) {
  await client`DELETE FROM ai_bot_ip_ranges WHERE vendor = 'p3s1-test-vendor'`.catch(() => {});
}
