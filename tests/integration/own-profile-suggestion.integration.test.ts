/**
 * 13 Nov (Sri's walk-through, part 9) -- real DB: the directory counts suggest the cited page that looks like
 * the brand's own profile while none is linked, and stop once the owner links it (through the listings
 * route, the same check as Brand settings).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const PROFILE =
  "https://www.localsearch.com.au/profile/hero-home-services/yennora-nsw/hot-water-systems/1234567";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: USER_ID,
    organizationId: ORG_ID,
    role: "owner",
    organization: { id: ORG_ID, name: "Own Profile Org", region: "au", metadata: {} },
  })),
}));

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`own-profile-${ORG_ID}`}, 'Own Profile Org', ${`own-profile-org-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER_ID}, ${`own-profile-owner-${ORG_ID}`}, ${ORG_ID}, ${`owner-${ORG_ID.slice(0, 8)}@own-profile.example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${USER_ID}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state, postcode, location_mode, location_confirmed_at, categories)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'herohomeservices', 'herohomeservices.com.au', 'tradies', 'au',
      ARRAY['NSW:Yennora']::text[], 'Yennora', 'NSW', '2161', 'fixed', now(), ARRAY['trades_plumbing']::text[])
  `;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, total_calls, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${["chatgpt"]}, 1, 1, 1, now())
  `;
  await sql`
    INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, sentiment_label, context_label, response_text, response_snippet, cited_sources)
    VALUES (${AUDIT_ID}, 'chatgpt', 'Best hot water repair in Yennora, NSW?', 0, 1, false, false, 'neutral', 'absent',
      'Hero Home Services (Yennora-based)', 'Hero Home Services (Yennora-based)',
      ${sql.json([{ url: `${PROFILE}?utm_source=openai`, domain: "localsearch.com.au", cited: true }])})
  `;
}, 30_000);

afterAll(async () => {
  await sql`DELETE FROM brand_directory_listings WHERE brand_id = ${BRAND_ID}`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`.catch(() => {});
  await sql`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await sql`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

async function localsearchRow() {
  const { serviceDb } = await import("@/db/client");
  const { getDirectoryCitationsForAudit } = await import("@/lib/directories/citation-counts");
  const result = await getDirectoryCitationsForAudit(serviceDb, AUDIT_ID, {
    id: BRAND_ID,
    region: "au",
    categories: ["trades_plumbing"],
    name: "herohomeservices",
    domain: "herohomeservices.com.au",
    suburb: "Yennora",
    state: "NSW",
    postcode: "2161",
  });
  return result.results.find((r) => r.directory.key === "localsearch");
}

describe("the cited page that looks like the brand's own profile", () => {
  it("is suggested, cleaned, while none is linked -- and nothing is stored", async () => {
    const row = await localsearchRow();
    expect(row?.citedCount).toBe(1);
    expect(row?.ownerProfileLinked).toBe(false);
    expect(row?.suggestedProfileUrl).toBe(PROFILE);
    const stored = await sql`SELECT 1 FROM brand_directory_listings WHERE brand_id = ${BRAND_ID}`;
    expect(stored).toHaveLength(0);
  });

  it("linked by the owner through the listings route, it counts as theirs and isn't suggested again", async () => {
    const { PUT } = await import("@/app/api/brands/[brandId]/directory-listings/route");
    const res = await PUT(
      new Request(`http://x/api/brands/${BRAND_ID}/directory-listings`, {
        method: "PUT",
        body: JSON.stringify({
          directoryKey: "localsearch",
          status: "listed",
          profileUrl: PROFILE,
        }),
      }),
      { params: Promise.resolve({ brandId: BRAND_ID }) },
    );
    expect(res.status).toBe(200);
    const row = await localsearchRow();
    expect(row?.ownerProfileLinked).toBe(true);
    expect(row?.ownerProfileCitedCount).toBe(1);
    expect(row?.suggestedProfileUrl).toBeNull();
  });
});
