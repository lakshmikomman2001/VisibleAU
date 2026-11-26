/**
 * S00 part 4 (22 Nov; LLD 8.8.2, migration 0153 brand aliases): the brand API and a real database.
 * - POST /api/brands keeps the aliases and the site's name suggestion the wizard sends; refuses aliases that break
 *   the rules (2-60 characters, not the name, up to 10, no exact repeats);
 * - PATCH keeps a new list, refuses a bad one (nothing changes), and a rename to a listed alias drops that alias;
 * - the database refuses more than 10 (the CHECK);
 * - GET /api/brands/name-suggestion reads the home page through the crawler (mocked: no live fetch in tests),
 *   answers only someone who may add a brand, refuses an IP address, and falls back to the domain's words.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const BRAND_ID = randomUUID();
const who = vi.hoisted(() => ({ role: "owner" as "owner" | "viewer", signedIn: true }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () =>
    who.signedIn
      ? {
          id: USER_ID,
          organizationId: ORG_ID,
          role: who.role,
          organization: { id: ORG_ID, name: "Aliases Org", region: "au", metadata: {} },
        }
      : null,
  ),
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
const crawl = vi.hoisted(() => ({
  html: null as string | null,
  fail: false,
  calls: [] as string[],
}));
vi.mock("@/lib/crawler", () => ({
  crawlSite: vi.fn(async (domain: string) => {
    crawl.calls.push(domain);
    if (crawl.fail) throw new Error("timeout");
    return {
      pages: crawl.html
        ? [{ url: `https://${domain}/`, title: "", excerpt: "", html: crawl.html }]
        : [],
    };
  }),
}));

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`aliases-${ORG_ID}`}, 'Aliases Org', ${`aliases-org-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test_agency', 'agency', 'monthly', 'active')
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER_ID}, ${`aliases-owner-${ORG_ID}`}, ${ORG_ID}, ${`owner-${ORG_ID.slice(0, 8)}@aliases.example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${USER_ID}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state, location_mode, location_confirmed_at)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'NumbaTek IT', 'numbatekit.com.au', 'local_business', 'au', ARRAY['NSW:Riverstone']::text[], 'Riverstone', 'NSW', 'fixed', now())
  `;
}, 30_000);

afterAll(async () => {
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

beforeEach(() => {
  who.role = "owner";
  who.signedIn = true;
  crawl.html = null;
  crawl.fail = false;
  crawl.calls = [];
});

async function patch(body: object) {
  const { PATCH } = await import("@/app/api/brands/[brandId]/route");
  return PATCH(
    new Request(`http://x/api/brands/${BRAND_ID}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ brandId: BRAND_ID }) },
  );
}

async function create(body: object) {
  const { POST } = await import("@/app/api/brands/route");
  return POST(new Request("http://x/api/brands", { method: "POST", body: JSON.stringify(body) }));
}

async function suggestion(domain: string) {
  const { GET } = await import("@/app/api/brands/name-suggestion/route");
  return GET(
    new Request(`http://x/api/brands/name-suggestion?domain=${encodeURIComponent(domain)}`),
  );
}

const stored = async (id: string = BRAND_ID) =>
  (
    await sql<{ name: string; aliases: string[]; name_suggestion: string | null }[]>`
      SELECT name, aliases, name_suggestion FROM brands WHERE id = ${id}`
  )[0];

describe("brand aliases on a real database", () => {
  it("an existing brand has none, and no suggestion (the migration's defaults)", async () => {
    expect(await stored()).toEqual({ name: "NumbaTek IT", aliases: [], name_suggestion: null });
  });

  // S01 part 0 (LLD section 0.2 #5: "aliases unique ignoring case"; contract C-27): S00's first list here was
  // ["numbatekit", "NumbaTekIT"], a case-only pair, which a new list may no longer hold; it's now among the bad ones.
  it("PATCH keeps a new list, trimmed; a bad list is refused and nothing changes", async () => {
    expect((await patch({ aliases: ["numbatekit", "  Quollen  Group "] })).status).toBe(200);
    expect((await stored()).aliases).toEqual(["numbatekit", "Quollen Group"]);
    for (const [bad, reason] of [
      [["numbatek it"], "That's the brand's name already."],
      [["A"], "A name is 2 to 60 characters."],
      [["numbatekit", "numbatekit"], "That name is already listed."],
      [["numbatekit", "Quollen Group", "NUMBATEKIT"], "That name is already listed."],
    ] as const) {
      const res = await patch({ aliases: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(JSON.stringify(await res.json())).toContain(reason);
    }
    expect(
      (await patch({ aliases: Array.from({ length: 11 }, (_, i) => `Name ${i}`) })).status,
    ).toBe(400);
    expect((await stored()).aliases).toEqual(["numbatekit", "Quollen Group"]);
  });

  it("S01 part 0: aliases saved before S01 with a case-only twin are kept as they are", async () => {
    await sql`UPDATE brands SET aliases = ARRAY['numbatekit', 'NumbaTekIT']::text[] WHERE id = ${BRAND_ID}`;
    expect((await patch({ aliases: ["numbatekit", "NumbaTekIT", "Quollen Group"] })).status).toBe(
      200,
    );
    expect((await stored()).aliases).toEqual(["numbatekit", "NumbaTekIT", "Quollen Group"]);
    expect((await patch({ vertical: "local_business" })).status).toBe(200);
    expect((await stored()).aliases).toEqual(["numbatekit", "NumbaTekIT", "Quollen Group"]);
    const twin = await patch({ aliases: ["numbatekit", "NumbaTekIT", "NUMBATEKIT"] });
    expect(twin.status).toBe(400);
    await patch({ aliases: [] });
  });

  it("a rename to a listed alias drops that alias; other saves keep the list", async () => {
    await patch({ aliases: ["Quollen Group", "NumbaTekIT"] });
    expect((await patch({ vertical: "local_business" })).status).toBe(200);
    expect((await stored()).aliases).toEqual(["Quollen Group", "NumbaTekIT"]);
    expect((await patch({ name: "Quollen Group" })).status).toBe(200);
    expect(await stored()).toMatchObject({ name: "Quollen Group", aliases: ["NumbaTekIT"] });
    await patch({ name: "NumbaTek IT", aliases: [] });
  });

  it("the database refuses more than 10 (the CHECK)", async () => {
    await expect(
      sql`UPDATE brands SET aliases = ${Array.from({ length: 11 }, (_, i) => `n${i}`)} WHERE id = ${BRAND_ID}`,
    ).rejects.toThrow(/brands_aliases_at_most_10/);
  });

  it("POST keeps the wizard's aliases and the site's suggestion", async () => {
    const res = await create({
      name: "Hero Home Services",
      domain: "hero-home-services.com.au",
      vertical: "tradies",
      aliases: ["HeroHomeServices"],
      nameSuggestion: "Hero Home Services",
      locationMode: "online_only",
    });
    expect(res.status).toBe(201);
    const { brand } = (await res.json()) as { brand: { id: string } };
    expect(await stored(brand.id)).toEqual({
      name: "Hero Home Services",
      aliases: ["HeroHomeServices"],
      name_suggestion: "Hero Home Services",
    });
  });

  it("S01 part 0: the site's suggestion is cut to 120 characters when written, never refused", async () => {
    const long = `Hero Home Services ${"and more ".repeat(20)}`.trim();
    expect(long.length).toBeGreaterThan(120);
    const res = await create({
      name: "Hero Home Services",
      domain: "hero-home-services-long.com.au",
      vertical: "tradies",
      nameSuggestion: long,
      locationMode: "online_only",
    });
    expect(res.status).toBe(201);
    const { brand } = (await res.json()) as { brand: { id: string } };
    const kept = (await stored(brand.id)).name_suggestion ?? "";
    expect(kept.length).toBeLessThanOrEqual(120);
    expect(long.startsWith(kept)).toBe(true);
  });

  it("POST refuses an alias that is the name, and a brand made without aliases has none", async () => {
    const refused = await create({
      name: "Omega Services",
      domain: "omega-services.com.au",
      vertical: "tradies",
      aliases: ["omega services"],
      locationMode: "online_only",
    });
    expect(refused.status).toBe(400);
    const res = await create({
      name: "Omega Services",
      domain: "omega-services.com.au",
      vertical: "tradies",
      locationMode: "online_only",
    });
    const { brand } = (await res.json()) as { brand: { id: string } };
    expect(await stored(brand.id)).toEqual({
      name: "Omega Services",
      aliases: [],
      name_suggestion: null,
    });
  });
});

describe("GET /api/brands/name-suggestion", () => {
  // S01 part 0 (LLD section 0.2 #5, C-27): "stop suggesting the name without spaces or the domain stem": S00
  // answered aliases ["numbatekit", "NumbaTekIT"] here; the field stays, always empty.
  it("reads the home page and suggests the site's name, and no aliases", async () => {
    crawl.html =
      "<html><head><title>Managed IT Services Western Sydney | NumbaTek IT</title></head></html>";
    const res = await suggestion("https://www.NumbaTekIT.com.au/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "NumbaTek IT",
      source: "title",
      aliases: [],
    });
    expect(crawl.calls).toEqual(["numbatekit.com.au"]);
  });

  it("a page that can't be read falls back to the domain's words, or nothing", async () => {
    crawl.fail = true;
    expect(await (await suggestion("hero-home-services.com.au")).json()).toMatchObject({
      name: "Hero Home Services",
      source: "domain",
    });
    expect(await (await suggestion("numbatekit.com.au")).json()).toEqual({
      name: null,
      source: null,
      aliases: [],
    });
  });

  it("refuses an IP address or a local name, without fetching anything", async () => {
    for (const bad of ["169.254.169.254", "localhost", "intranet.local"]) {
      expect((await suggestion(bad)).status, bad).toBe(400);
    }
    expect(crawl.calls).toEqual([]);
  });

  it("only someone who may add a brand asks: 401 signed out, 403 a viewer", async () => {
    who.signedIn = false;
    expect((await suggestion("numbatekit.com.au")).status).toBe(401);
    who.signedIn = true;
    // The role the API decides by is the stored membership's (lib/governance/access-control.ts roleRefusal).
    who.role = "viewer";
    await sql`UPDATE org_members SET role = 'viewer' WHERE organization_id = ${ORG_ID}`;
    try {
      expect((await suggestion("numbatekit.com.au")).status).toBe(403);
    } finally {
      await sql`UPDATE org_members SET role = 'owner' WHERE organization_id = ${ORG_ID}`;
    }
    expect(crawl.calls).toEqual([]);
  });
});
