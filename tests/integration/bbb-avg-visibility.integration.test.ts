/**
 * ⚠️ BBB — the dashboard's "Avg visibility" KPI must average each brand's
 * LATEST completed audit, not every historical audit row. Task ZZ found
 * AVG(score_composite) over all audits blends pre-QQ inflated scores
 * (65.9/66.9) with post-QQ honest ones (0.0), reading 46.4 while the
 * brand's current visibility is actually 0.0 -- and weights multi-brand
 * orgs by how many times each brand happened to be audited.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

const TEST_ORG_ID = "bbb00000-0000-4000-8000-000000000001";
const BRAND_1_ID = "bbb00000-0000-4000-8000-000000000002";
const BRAND_2_ID = "bbb00000-0000-4000-8000-000000000003";

let client: ReturnType<typeof postgres>;
let auditCounter = 0;
const auditIds: string[] = [];

function nextAuditId(): string {
  auditCounter += 1;
  return `bbb00000-0000-4000-9000-${String(auditCounter).padStart(12, "0")}`;
}

async function seedAudit(brandId: string, orgId: string, score: string, completedAt: Date) {
  const id = nextAuditId();
  auditIds.push(id);
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, score_composite, completed_at, created_at)
    VALUES (${id}, ${brandId}, ${orgId}, ${auditCounter}, 'complete', ARRAY['chatgpt'], ${score}, ${completedAt}, ${completedAt})
  `;
}

async function avgVisibilityFor(orgId: string): Promise<string> {
  const result = await client`
    SELECT COALESCE(ROUND(AVG(sc)::numeric, 1)::text, '') AS avg
    FROM (
      SELECT DISTINCT ON (brand_id) score_composite::numeric AS sc
      FROM audits
      WHERE organization_id = ${orgId} AND status = 'complete'
      ORDER BY brand_id, completed_at DESC
    ) latest_per_brand
  `;
  return result[0]?.avg ?? "";
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${TEST_ORG_ID}, 'bbb-avg-vis-clerk', 'BBB Avg Visibility Test Org', 'bbb-avg-vis')
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_1_ID}, ${TEST_ORG_ID}, 'BBB Brand One', 'bbb-brand-one.example.com', 'tradies', 'au', ARRAY['NSW:Sydney'])
    ON CONFLICT (id) DO NOTHING
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_2_ID}, ${TEST_ORG_ID}, 'BBB Brand Two', 'bbb-brand-two.example.com', 'tradies', 'au', ARRAY['NSW:Sydney'])
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  for (const id of auditIds) await client`DELETE FROM audits WHERE id = ${id}`.catch(() => {});
  await client`DELETE FROM brands WHERE id IN (${BRAND_1_ID}, ${BRAND_2_ID})`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
});

describe("⚠️ BBB — Avg visibility: latest-per-brand, not all-audits", () => {
  it("a single brand with [65.9 (oldest), 66.9, 0.0 (latest)] -> avg is 0.0, not ~44.3", async () => {
    await seedAudit(BRAND_1_ID, TEST_ORG_ID, "65.90", new Date("2026-09-01T00:00:00Z"));
    await seedAudit(BRAND_1_ID, TEST_ORG_ID, "66.90", new Date("2026-09-15T00:00:00Z"));
    await seedAudit(BRAND_1_ID, TEST_ORG_ID, "0.00", new Date("2026-10-01T00:00:00Z"));

    const avg = await avgVisibilityFor(TEST_ORG_ID);

    // The naive all-audits average would be (65.9+66.9+0.0)/3 = 44.27 ~ 44.3.
    const naiveAvg = (65.9 + 66.9 + 0.0) / 3;
    expect(Number(avg)).not.toBeCloseTo(naiveAvg, 0);
    expect(avg).toBe("0.0");
  });

  it("a 2-brand org averages each brand's latest, not weighted by audit count", async () => {
    // Brand 1 already has 3 audits seeded above, latest = 0.0.
    // Brand 2 gets exactly 1 audit, score 50.0.
    await seedAudit(BRAND_2_ID, TEST_ORG_ID, "50.00", new Date("2026-10-01T00:00:00Z"));

    const avg = await avgVisibilityFor(TEST_ORG_ID);

    // mean(0.0, 50.0) = 25.0 -- NOT influenced by brand 1 having 3x the rows.
    expect(avg).toBe("25.0");
  });

  it("a brand audited again (new latest) replaces its contribution entirely", async () => {
    await seedAudit(BRAND_1_ID, TEST_ORG_ID, "80.00", new Date("2026-10-15T00:00:00Z"));

    const avg = await avgVisibilityFor(TEST_ORG_ID);

    // Brand 1's latest is now 80.0 (not 0.0), Brand 2 still 50.0 -> mean 65.0.
    expect(avg).toBe("65.0");
  });
});
