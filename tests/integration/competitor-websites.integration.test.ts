/**
 * Fair competitor counting (7 Nov) -- competitor websites are set in brand settings through
 * PATCH /api/brands/[brandId]: each address is stored as its bare host, only for the brand's own
 * competitors, and a competitor that's removed takes its website with it.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const BRAND = randomUUID();
const USER = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: USER, organizationId: ORG })),
}));

let client: ReturnType<typeof postgres>;

async function patch(body: unknown) {
  const { PATCH } = await import("@/app/api/brands/[brandId]/route");
  const res = await PATCH(
    new Request("http://test/api/brands/x", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ brandId: BRAND }) },
  );
  return { status: res.status, body: await res.json() };
}

async function stored(): Promise<unknown> {
  const [row] = await client`SELECT competitor_websites FROM brands WHERE id = ${BRAND}`;
  return row.competitor_websites;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`cw-${ORG}`}, 'Competitor Websites Org', ${`cw-${ORG}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND}, ${ORG}, 'Alphaline Plumbing', 'alphaline.example.com.au', 'tradies', 'au',
      ARRAY['NSW:Castle Hill'], ARRAY['Rivalto Plumbing', 'Harbourline Drains'])
  `;
}, 120_000);

afterAll(async () => {
  await client`DELETE FROM brands WHERE id = ${BRAND}`;
  await client`DELETE FROM organizations WHERE id = ${ORG}`;
  await client.end();
});

describe("competitor websites in brand settings", () => {
  it("a new brand has none", async () => {
    expect(await stored()).toEqual({});
  });

  it("stores each address as its bare host", async () => {
    const res = await patch({
      competitorWebsites: { "Rivalto Plumbing": "https://www.Rivalto.example.com.au/contact?x=1" },
    });
    expect(res.status).toBe(200);
    expect(res.body.brand.competitorWebsites).toEqual({
      "Rivalto Plumbing": "rivalto.example.com.au",
    });
    expect(await stored()).toEqual({ "Rivalto Plumbing": "rivalto.example.com.au" });
  });

  it("refuses a name that isn't one of the brand's competitors, and an address that isn't one", async () => {
    expect((await patch({ competitorWebsites: { "Someone Else": "x.example.com" } })).status).toBe(
      400,
    );
    expect(
      (await patch({ competitorWebsites: { "Harbourline Drains": "not a site" } })).status,
    ).toBe(400);
    expect(await stored()).toEqual({ "Rivalto Plumbing": "rivalto.example.com.au" });
  });

  it("a removed competitor takes its website with it", async () => {
    const res = await patch({ competitors: ["Harbourline Drains"] });
    expect(res.status).toBe(200);
    expect(await stored()).toEqual({});
  });

  it("an empty value removes a website", async () => {
    await patch({ competitorWebsites: { "Harbourline Drains": "harbourline.example.com.au" } });
    expect(await stored()).toEqual({ "Harbourline Drains": "harbourline.example.com.au" });
    await patch({ competitorWebsites: { "Harbourline Drains": "  " } });
    expect(await stored()).toEqual({});
  });
});
