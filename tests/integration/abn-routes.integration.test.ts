/**
 * S01 part 11 (LLD 8.8.6, amendment 25; contract P01.abnField, P01.abn): the ABN field and the ABN suggestion, on a
 * real database with recorded ABR responses (no live calls: fetch is stubbed for abr.business.gov.au only).
 * - PATCH /api/brands/:id { abn }: digits saved (spaces allowed), empty clears it, a bad checksum is 400 in the
 *   contract's words, an analyst can't (manage_brands), a new ABN goes in the audit trail and queues the entity check.
 * - GET /api/brands/:id/abn-suggestion (flag abn_suggestion): one confident match -> the suggestion, stored until
 *   answered; none for a brand with an ABN or outside Australia; flag off -> none.
 * - POST { confirm }: writes brands.abn, audit trail, entity check queued; POST { dismiss }: never shown again.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const OWNER = randomUUID();
const ANALYST = randomUUID();
const BRAND = randomUUID();
const who = vi.hoisted(() => ({ id: "", orgId: "" }));
const queued = vi.hoisted(() => ({ entityChecks: [] as string[] }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: who.id,
    organizationId: who.orgId,
    email: "someone@abn-routes.example.com.au",
    name: "Someone",
    role: "member",
    organization: { id: who.orgId, name: "NumbaTek Agency", region: "au", metadata: {} },
  })),
}));
// after() runs the entity check once the response is sent; here it's recorded instead (no live ABR call).
vi.mock("@/lib/brand-entity/entity-check", () => ({
  runBrandEntityCheck: vi.fn(async (_org: string, brandId: string) => {
    queued.entityChecks.push(brandId);
  }),
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    void fn();
  },
}));

const MATCHING = `callback(${JSON.stringify({
  Message: "",
  Names: [
    {
      Abn: "51824753605",
      AbnStatus: "0000000001",
      IsCurrent: true,
      Name: "NumbaTek IT",
      NameType: "Business Name",
      Postcode: "2765",
      Score: 100,
      State: "NSW",
    },
  ],
})})`;
const DETAILS = `callback(${JSON.stringify({ Abn: "51824753605", AbnStatus: "Active", EntityName: "QUOLLEN GROUP PTY LTD", BusinessName: ["NumbaTek IT"], AddressPostcode: "2765", AddressState: "NSW" })})`;

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const realFetch = globalThis.fetch;
let abrCalls = 0;

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG}, ${`abn-${ORG}`}, 'NumbaTek Agency', ${`abn-${ORG}`})`;
  for (const [id, role] of [
    [OWNER, "owner"],
    [ANALYST, "analyst"],
  ] as const) {
    await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`abn-${id}`}, ${ORG}, ${`${role}-${id.slice(0, 8)}@abn-routes.example.com.au`}, ${role}, 'member')`;
    await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG}, ${id}, ${role}, now(), now(), true)`;
  }
  await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, postcode, state)
    VALUES (${BRAND}, ${ORG}, 'NumbaTek IT', ${`numbatek-${BRAND.slice(0, 8)}.com.au`}, 'tradies', 'au', '2765', 'NSW')`;
}, 30_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const table of ["audit_trail", "org_feature_flags", "org_members"])
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

beforeEach(async () => {
  who.id = OWNER;
  who.orgId = ORG;
  queued.entityChecks.length = 0;
  abrCalls = 0;
  vi.stubEnv("ABN_LOOKUP_GUID", "test-guid");
  vi.stubEnv("ABN_LOOKUP_BYPASS", "");
  // Only the ABR is stubbed, with the recorded answers; anything else is the real fetch.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://abr.business.gov.au/json/")) {
      abrCalls++;
      return new Response(url.includes("MatchingNames") ? MATCHING : DETAILS);
    }
    return realFetch(input, init);
  }) as typeof fetch;
  await sql`UPDATE brands SET abn = NULL, abn_suggestion = NULL, region = 'au' WHERE id = ${BRAND}`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG}`;
  await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${ORG}, 'abn_suggestion', true)`;
});

const ctx = { params: Promise.resolve({ brandId: BRAND }) };

async function patchAbn(abn: string | null) {
  const { PATCH } = await import("@/app/api/brands/[brandId]/route");
  const res = await PATCH(
    new Request("http://x", { method: "PATCH", body: JSON.stringify({ abn }) }),
    ctx,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function storedAbn(): Promise<string | null> {
  const [b] = await sql<{ abn: string | null }[]>`SELECT abn FROM brands WHERE id = ${BRAND}`;
  return b.abn;
}
async function trail() {
  return sql<{ action: string; metadata: Record<string, unknown> }[]>`
    SELECT action, metadata FROM audit_trail WHERE organization_id = ${ORG}`;
}

describe("the ABN field (PATCH /api/brands/:id)", () => {
  it("saves the digits, goes in the audit trail and queues the entity check", async () => {
    const { status } = await patchAbn("51 824 753 605");
    expect(status).toBe(200);
    expect(await storedAbn()).toBe("51824753605");
    expect((await trail()).map((t) => [t.action, t.metadata.abn])).toEqual([
      ["brand_abn_changed", "51824753605"],
    ]);
    expect(queued.entityChecks).toEqual([BRAND]);
  });

  it("empty clears it (no entity check); the same ABN again changes nothing", async () => {
    await patchAbn("51824753605");
    queued.entityChecks.length = 0;
    expect((await patchAbn("51824753605")).status).toBe(200);
    expect(queued.entityChecks).toEqual([]);
    expect((await patchAbn("")).status).toBe(200);
    expect(await storedAbn()).toBeNull();
    expect(queued.entityChecks).toEqual([]);
  });

  it("a bad checksum or too few digits is 400 in the contract's words, and nothing changes", async () => {
    const bad = await patchAbn("51 824 753 606");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("abn: This isn't a valid ABN. Check the digits.");
    expect((await patchAbn("123")).body.error).toBe("abn: Enter the 11 digits of an ABN.");
    expect(await storedAbn()).toBeNull();
  });

  it("an analyst can't change it (manage_brands)", async () => {
    who.id = ANALYST;
    expect((await patchAbn("51824753605")).status).toBe(403);
    expect(await storedAbn()).toBeNull();
  });
});

describe("the ABN suggestion", () => {
  async function get() {
    const { GET } = await import("@/app/api/brands/[brandId]/abn-suggestion/route");
    return (await (await GET(new Request("http://x"), ctx)).json()) as {
      suggestion: Record<string, unknown> | null;
    };
  }
  async function answer(action: string) {
    const { POST } = await import("@/app/api/brands/[brandId]/abn-suggestion/route");
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ action }) }),
      ctx,
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("one confident match: the suggestion, looked up once and kept until answered", async () => {
    const first = await get();
    expect(first.suggestion).toMatchObject({
      abn: "51824753605",
      entity: "QUOLLEN GROUP PTY LTD",
      state: "NSW",
      postcode: "2765",
      abnStatus: "Active",
    });
    expect(abrCalls).toBe(2);
    expect((await get()).suggestion?.abn).toBe("51824753605");
    expect(abrCalls).toBe(2);
  });

  it("Confirm writes the ABN, goes in the audit trail and queues the entity check", async () => {
    await get();
    const { status, body } = await answer("confirm");
    expect(status).toBe(200);
    expect(body.abn).toBe("51824753605");
    expect(await storedAbn()).toBe("51824753605");
    expect((await trail()).map((t) => [t.action, t.metadata.source])).toEqual([
      ["brand_abn_changed", "abn_suggestion"],
    ]);
    expect(queued.entityChecks).toEqual([BRAND]);
    expect((await get()).suggestion).toBeNull();
  });

  it("Not mine hides it for good", async () => {
    await get();
    expect((await answer("dismiss")).status).toBe(200);
    expect((await get()).suggestion).toBeNull();
    expect(await storedAbn()).toBeNull();
    expect((await answer("confirm")).status).toBe(404);
  });

  it("none for a brand with an ABN, outside Australia, or with the flag off; an analyst can't answer", async () => {
    await sql`UPDATE brands SET abn = '51824753605' WHERE id = ${BRAND}`;
    expect((await get()).suggestion).toBeNull();
    await sql`UPDATE brands SET abn = NULL, region = 'nz' WHERE id = ${BRAND}`;
    expect((await get()).suggestion).toBeNull();
    await sql`UPDATE brands SET region = 'au' WHERE id = ${BRAND}`;
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG}`;
    expect((await get()).suggestion).toBeNull();
    expect(abrCalls).toBe(0);
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${ORG}, 'abn_suggestion', true)`;
    await get();
    who.id = ANALYST;
    expect((await answer("confirm")).status).toBe(403);
  });
});
