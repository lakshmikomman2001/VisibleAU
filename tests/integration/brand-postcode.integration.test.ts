/**
 * 13 Nov (Sri's walk-through, part 8) -- real DB (migration 0146): the brand API keeps the owner's postcode
 * (four digits or none), and the database refuses anything else; the Google dispatch reads it when the
 * operator has set none.
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

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: USER_ID,
    organizationId: ORG_ID,
    role: "owner",
    organization: { id: ORG_ID, name: "Postcode Org", region: "au", metadata: {} },
  })),
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`postcode-${ORG_ID}`}, 'Postcode Org', ${`postcode-org-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER_ID}, ${`postcode-owner-${ORG_ID}`}, ${ORG_ID}, ${`owner-${ORG_ID.slice(0, 8)}@postcode.example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${USER_ID}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state, location_mode, location_confirmed_at)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Hero Home Services', 'hero.example.com.au', 'tradies', 'au', ARRAY['NSW:Yennora']::text[], 'Yennora', 'NSW', 'fixed', now())
  `;
}, 30_000);

afterAll(async () => {
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

async function patch(body: object) {
  const { PATCH } = await import("@/app/api/brands/[brandId]/route");
  return PATCH(
    new Request(`http://x/api/brands/${BRAND_ID}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ brandId: BRAND_ID }) },
  );
}
const stored = async () =>
  (await sql<{ postcode: string | null }[]>`SELECT postcode FROM brands WHERE id = ${BRAND_ID}`)[0]
    .postcode;

describe("the brand's own postcode", () => {
  it("is kept with the location, and refused when it isn't four digits", async () => {
    expect(
      (await patch({ locationMode: "fixed", suburb: "Yennora", state: "NSW", postcode: "2161" }))
        .status,
    ).toBe(200);
    expect(await stored()).toBe("2161");
    const refused = await patch({ postcode: "216" });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(await refused.json())).toContain(
      "An Australian postcode is four digits.",
    );
    expect(await stored()).toBe("2161");
    expect((await patch({ postcode: null })).status).toBe(200);
    expect(await stored()).toBeNull();
  });

  it("the database refuses anything but four digits too (the CHECK)", async () => {
    await expect(sql`UPDATE brands SET postcode = '21610' WHERE id = ${BRAND_ID}`).rejects.toThrow(
      /brands_postcode_four_digits/,
    );
  });

  it("the Google dispatch reads it when the operator has set none (brandGooglePostcode is null)", async () => {
    await sql`UPDATE brands SET postcode = '2161' WHERE id = ${BRAND_ID}`;
    const { googleLocationForBrand } = await import("@/lib/google-surfaces/location");
    const [brand] = await sql<
      {
        postcode: string | null;
        suburb: string | null;
        city: string | null;
        state: string | null;
        location_mode: string | null;
      }[]
    >`SELECT postcode, suburb, city, state, location_mode FROM brands WHERE id = ${BRAND_ID}`;
    const [operator] = await sql<
      { postcode: string }[]
    >`SELECT postcode FROM brand_google_locations WHERE brand_id = ${BRAND_ID}`;
    expect(operator).toBeUndefined();
    expect(
      googleLocationForBrand(operator?.postcode ?? null, {
        ...brand,
        locationMode: brand.location_mode,
      }),
    ).toMatchObject({ ok: true, location: { label: "2161 NSW", precise: true } });
  });
});
