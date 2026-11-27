/**
 * S03 part 5 (LLD 8.3.4; contract P05): the workspace's Questions settings through the real routes.
 * - GET /api/settings/questions: owners and admins; one row per brand (current set's everyday count against what the
 *   brand may run, packs counted on a plan with packs, agency-written count, version, last change -- "backfill" for
 *   0155's version 1), newest change first; the defaults (the plan's included count and suggestions on when unset);
 * - PUT: saves within 5 and the included count (422 outside), 403 plan_required on Starter, "unchanged" when nothing
 *   changed, the Audit Trail, and never an existing brand's set;
 * - POST /api/brands/:id/questions/copy-from: the source's everyday questions become the target's suggestions (source
 *   agency), places swapped, never shared rows; questions naming the business and ones the target has are skipped;
 *   another workspace's brand 404, the same brand 422, Starter 403, a viewer 403, flag off 404.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const OWNER = randomUUID();
const ANALYST = randomUUID();
const VIEWER = randomUUID();
const SOURCE = randomUUID();
const TARGET = randomUUID();
const FOREIGN = randomUUID();

const current = vi.hoisted(() => ({ user: { id: "", organizationId: "", role: "owner" } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => current.user) }));

let sql: ReturnType<typeof postgres>;

async function settings(method: "GET" | "PUT" = "GET", body?: unknown) {
  const mod = await import("@/app/api/settings/questions/route");
  const res =
    method === "GET"
      ? await mod.GET()
      : await mod.PUT(
          new Request("http://localhost/api/settings/questions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function copy(target: string, sourceBrandId: string) {
  const { POST } = await import("@/app/api/brands/[brandId]/questions/copy-from/route");
  const res = await POST(
    new Request(`http://localhost/api/brands/${target}/questions/copy-from`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceBrandId }),
    }),
    { params: Promise.resolve({ brandId: target }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const as = (id: string, role: string) => {
  current.user = { id, organizationId: ORG, role };
};

async function seedSet(
  brandId: string,
  orgId: string,
  version: number,
  note: string | null,
  items: Array<[string, string, string]>,
) {
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash, note, applied_by, applied_at)
    VALUES (${orgId}, ${brandId}, ${version}, true, 'h', ${note}, ${note ? null : OWNER},
            ${note ? "2026-11-20T00:00:00Z" : "2026-11-26T00:00:00Z"}) RETURNING id`;
  for (const [i, [text, kind, source]] of items.entries()) {
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${orgId}, ${brandId}, ${text}, question_text_key(${text}), ${kind}, ${source}) RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${orgId}, ${q.id}, ${i}, ${kind}, 'local', ${source})`;
  }
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  for (const org of [ORG, OTHER_ORG]) {
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`qsettings-${org}`}, 'Question Settings Org', ${`qsettings-${org}`})`;
    await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                         tier, billing_interval, status)
      VALUES (${org}, ${`cus_${org}`}, ${`sub_${org}`}, 'price_test', 'agency', 'monthly', 'active')`;
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${org}, 'agency_questions', true)`;
  }
  for (const [id, role] of [
    [OWNER, "owner"],
    [ANALYST, "analyst"],
    [VIEWER, "viewer"],
  ] as const) {
    await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`qsettings-${id}`}, ${ORG}, ${`${role}-${id}@qsettings.example.com.au`}, ${`Pat ${role}`}, ${role})`;
    await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG}, ${id}, ${role}, now(), now(), true)`;
  }
  for (const [id, org, name, suburb] of [
    [SOURCE, ORG, "Wattlebird Plumbing", "Chatswood"],
    [TARGET, ORG, "Kookaburra Plumbing", "Parramatta"],
    [FOREIGN, OTHER_ORG, "Foreign Plumbing", "Manly"],
  ] as const) {
    await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state)
      VALUES (${id}, ${org}, ${name}, ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
              ${[`NSW:${suburb}`]}, ${suburb}, 'NSW')`;
  }
  await seedSet(SOURCE, ORG, 2, null, [
    ["Who is the best plumber in Chatswood?", "everyday", "original"],
    ["Who fixes burst pipes in Chatswood at night?", "everyday", "agency"],
    ["Which Chatswood plumber is cheapest?", "everyday", "original"],
    ["Is Wattlebird Plumbing reputable?", "branded", "original"],
  ]);
  await seedSet(TARGET, ORG, 1, "0155 backfill: the stored question pack", [
    ["Who is the best plumber in Parramatta?", "everyday", "original"],
    ["Is Kookaburra Plumbing reputable?", "branded", "original"],
  ]);
  await seedSet(FOREIGN, OTHER_ORG, 1, null, [
    ["Who is the best plumber in Manly?", "everyday", "original"],
  ]);
  await sql`INSERT INTO brand_question_packs (brand_id, organization_id, packs) VALUES (${SOURCE}, ${ORG}, 1)`;
  as(OWNER, "owner");
}, 60_000);

afterAll(async () => {
  const orgs = [ORG, OTHER_ORG];
  await sql`DELETE FROM audit_trail WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_packs WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brands WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM users WHERE id = ANY(${[OWNER, ANALYST, VIEWER]})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
});

describe("GET /api/settings/questions", () => {
  it("owners: the plan, the defaults, and one row per brand, newest change first", async () => {
    const res = await settings();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      plan: "agency",
      planName: "Agency",
      included: 10,
      canWrite: true,
      defaults: { everydayCount: 10, fillWithSuggestions: true },
    });
    const brands = res.body.brands as Array<Record<string, unknown>>;
    expect(brands.map((b) => b.name)).toEqual(["Wattlebird Plumbing", "Kookaburra Plumbing"]);
    expect(brands[0]).toMatchObject({
      areas: ["Local"],
      everydayActive: 3,
      everydayAllowed: 20,
      packs: 1,
      writtenByAgency: 1,
      version: 2,
      lastChange: { at: "2026-11-26T00:00:00.000Z", by: "Pat owner", backfill: false },
    });
    expect(brands[1]).toMatchObject({
      everydayActive: 1,
      everydayAllowed: 10,
      packs: 0,
      writtenByAgency: 0,
      version: 1,
      lastChange: { backfill: true },
    });
  });

  it("an analyst or a viewer can't open it (403); flag off 404", async () => {
    as(ANALYST, "analyst");
    expect((await settings()).status).toBe(403);
    as(VIEWER, "viewer");
    expect((await settings()).status).toBe(403);
    as(OWNER, "owner");
    await sql`UPDATE org_feature_flags SET is_enabled = false WHERE organization_id = ${ORG}`;
    expect((await settings()).status).toBe(404);
    await sql`UPDATE org_feature_flags SET is_enabled = true WHERE organization_id = ${ORG}`;
  });
});

describe("PUT /api/settings/questions", () => {
  it("saves within 5 and the included count, says when nothing changed, and leaves every brand's set alone", async () => {
    const before =
      await sql`SELECT id, version, is_current FROM brand_question_sets WHERE organization_id = ${ORG} ORDER BY id`;
    const saved = await settings("PUT", { everydayCount: 7, fillWithSuggestions: false });
    expect(saved).toEqual({
      status: 200,
      body: { defaults: { everydayCount: 7, fillWithSuggestions: false }, status: "saved" },
    });
    expect((await settings()).body.defaults).toEqual({
      everydayCount: 7,
      fillWithSuggestions: false,
    });
    expect(
      (await settings("PUT", { everydayCount: 7, fillWithSuggestions: false })).body.status,
    ).toBe("unchanged");
    expect(
      await sql`SELECT id, version, is_current FROM brand_question_sets WHERE organization_id = ${ORG} ORDER BY id`,
    ).toEqual(before);
    const [trail] = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM audit_trail WHERE organization_id = ${ORG} AND action = 'question_defaults_changed'`;
    expect(trail.metadata).toMatchObject({
      after: { everydayCount: 7, fillWithSuggestions: false },
    });
  });

  it("422 outside 5 and the included count; 400 for a bad body; Starter 403 plan_required", async () => {
    expect((await settings("PUT", { everydayCount: 4, fillWithSuggestions: true })).status).toBe(
      422,
    );
    const high = await settings("PUT", { everydayCount: 11, fillWithSuggestions: true });
    expect(high).toEqual({
      status: 422,
      body: { error: "invalid_count", message: "Choose between 5 and 10 everyday questions." },
    });
    expect((await settings("PUT", { everydayCount: "7" })).status).toBe(400);
    await sql`UPDATE subscriptions SET tier = 'starter' WHERE organization_id = ${ORG}`;
    const starter = await settings("PUT", { everydayCount: 8, fillWithSuggestions: true });
    expect(starter.status).toBe(403);
    expect(starter.body).toMatchObject({ code: "plan_required", plan: "growth" });
    expect((await settings()).body).toMatchObject({ canWrite: false, plan: "starter" });
    await sql`UPDATE subscriptions SET tier = 'agency' WHERE organization_id = ${ORG}`;
  });
});

describe("POST /api/brands/:id/questions/copy-from", () => {
  it("the source's everyday questions become the target's suggestions, places swapped, never shared rows", async () => {
    // Three everyday questions: "Who is the best plumber in Chatswood?" becomes the target's own "... in Parramatta?"
    // (skipped); the one naming the business is never copied.
    const res = await copy(TARGET, SOURCE);
    expect(res).toEqual({ status: 200, body: { added: 2 } });
    const rows = await sql<
      { text: string; source: string; status: string; brand_id: string; created_by: string }[]
    >`
      SELECT text, source, status, brand_id, created_by FROM brand_questions
      WHERE brand_id = ${TARGET} AND status = 'suggested' ORDER BY text COLLATE "C"`;
    expect(rows.map((r) => r.text)).toEqual([
      "Which Parramatta plumber is cheapest?",
      "Who fixes burst pipes in Parramatta at night?",
    ]);
    expect(
      rows.every((r) => r.source === "agency" && r.brand_id === TARGET && r.created_by === OWNER),
    ).toBe(true);
    expect(rows.some((r) => /Chatswood|Wattlebird/.test(r.text))).toBe(false);
    // The source keeps its own rows: copies are copies.
    expect(
      Number(
        (await sql`SELECT count(*) AS c FROM brand_questions WHERE brand_id = ${SOURCE}`)[0].c,
      ),
    ).toBe(4);
    const [trail] = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM audit_trail WHERE organization_id = ${ORG} AND action = 'brand_questions_copied'`;
    expect(trail.metadata).toMatchObject({ sourceBrandId: SOURCE, added: 2 });
  });

  it("copying again adds nothing new (they're the target's already)", async () => {
    expect((await copy(TARGET, SOURCE)).body).toEqual({ added: 0 });
  });

  it("another workspace's brand 404 either way; the same brand 422; Starter 403; a viewer 403; flag off 404", async () => {
    expect((await copy(TARGET, FOREIGN)).status).toBe(404);
    expect((await copy(FOREIGN, SOURCE)).status).toBe(404);
    expect((await copy(TARGET, TARGET)).status).toBe(422);
    await sql`UPDATE subscriptions SET tier = 'starter' WHERE organization_id = ${ORG}`;
    expect((await copy(TARGET, SOURCE)).body).toMatchObject({
      code: "plan_required",
      plan: "growth",
    });
    await sql`UPDATE subscriptions SET tier = 'agency' WHERE organization_id = ${ORG}`;
    as(VIEWER, "viewer");
    expect((await copy(TARGET, SOURCE)).status).toBe(403);
    as(OWNER, "owner");
    await sql`UPDATE org_feature_flags SET is_enabled = false WHERE organization_id = ${ORG}`;
    expect((await copy(TARGET, SOURCE)).status).toBe(404);
    await sql`UPDATE org_feature_flags SET is_enabled = true WHERE organization_id = ${ORG}`;
    expect(
      await sql`SELECT 1 FROM brand_questions WHERE brand_id = ${FOREIGN} AND status = 'suggested'`,
    ).toHaveLength(0);
  });
});
