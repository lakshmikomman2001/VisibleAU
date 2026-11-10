/**
 * Mock-gate and retention follow-ups (9 Nov), part 9 -- Omega Services' Trust page showed "Overall Trust Score 0/100"
 * with an empty bar, under text saying no trust data was available and "Run an audit or check to establish a
 * baseline score", though Omega had 5 audits. Its Entity score was 0 from facts nobody had checked: the ABN lookup
 * skipped (no ABR GUID), the .au domain never looked at, no Wikipedia article found.
 * Now, through the real route on the local test database:
 * - nothing checked: overallTrustScore null, and the rationale names what actually feeds the score -- the Entity and
 *   YouTube checks -- never "Run an audit";
 * - a measured 0 (the domain looked at, not .au): 0, with what it's based on, never "no data".
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NOT_MEASURED } from "@/lib/scoring/measured";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const USER = randomUUID();
const UNCHECKED = randomUUID();
const MEASURED_ZERO = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: USER,
    organizationId: ORG,
    organization: { id: ORG },
    role: "owner",
  }),
}));

let sql: ReturnType<typeof postgres>;

async function trust(brandId: string): Promise<Record<string, unknown>> {
  const { GET } = await import("@/app/api/brands/[brandId]/trust/route");
  const res = await GET(new Request(`http://localhost/api/brands/${brandId}/trust`), {
    params: Promise.resolve({ brandId }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`tnm-${ORG}`}, 'Trust Not Measured Org', ${`tnm-${ORG}`})
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_agency_pro_test', 'agency_pro', 'monthly', 'active')
  `;
  for (const [id, name] of [
    [UNCHECKED, "Omega Services"],
    [MEASURED_ZERO, "Zero Plumbing"],
  ] as const) {
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region)
      VALUES (${id}, ${ORG}, ${name}, ${`${id.slice(0, 8)}.example.com`}, 'tradies', 'au')
    `;
  }
  // Nothing checked: ABN skipped, .au never looked at, no article found.
  await sql`
    INSERT INTO brand_entity_scores (brand_id, organization_id, abn_verified, abn_status, wikipedia_au_present, au_tld_present)
    VALUES (${UNCHECKED}, ${ORG}, false, 'check_skipped', false, null)
  `;
  // A measured 0: the domain was looked at and isn't .au; the ABN still skipped.
  await sql`
    INSERT INTO brand_entity_scores (brand_id, organization_id, abn_verified, abn_status, wikipedia_au_present, au_tld_present)
    VALUES (${MEASURED_ZERO}, ${ORG}, false, 'check_skipped', false, false)
  `;
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM brand_entity_scores WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("the Trust score: not measured is not 0", () => {
  it("nothing checked: no score, and the checks that feed it named -- never 'Run an audit'", async () => {
    const body = await trust(UNCHECKED);
    expect(body.entityScore).toBeNull();
    expect(body.overallTrustScore).toBeNull();
    expect(body.overallBasis).toBeNull();
    // Since the af8de42..d1eb5a1 follow-ups (part 4): no "Not measured yet." of its own (the card shows it just
    // above), and "Omega Services'" -- it began "Not measured yet. Omega Services's Trust Score".
    expect(String(body.rationale)).not.toContain(NOT_MEASURED);
    expect(String(body.rationale)).toMatch(/^Omega Services' Trust Score comes from /);
    expect(String(body.rationale)).toContain(
      "the Entity check (ABN, .au domain and Wikipedia AU) and the YouTube check",
    );
    expect(String(body.rationale)).not.toMatch(/Run an audit|baseline/i);
    expect(String(body.riskRationale)).not.toMatch(/hasn't been built/);
  }, 60_000);

  it("a measured 0: 0, with what it's based on, never 'no data'", async () => {
    const body = await trust(MEASURED_ZERO);
    expect(body.entityScore).toBe(0);
    expect(body.overallTrustScore).toBe(0);
    expect(body.overallBasis).toBe("Based on: Entity 0/100");
    expect(String(body.rationale)).toBe(
      "Zero Plumbing's trust score is 0/100: none of the signals it measures was found.",
    );
  }, 60_000);
});
