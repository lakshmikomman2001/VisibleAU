/**
 * S04 part 6 (LLD 8.4.1, 8.4.7; contract P01.reach): GET/PUT /api/brands/:id/reaches and applying the draft.
 * - visibility_reach off: 404 for both; another workspace's brand: 404; saving needs manage_brands (a viewer: 403).
 * - GET for a brand with no reach row: Local only, with its set's 10 everyday questions; the places from lib/markets
 *   (NSW, Australia, Worldwide); the plan's limits.
 * - PUT refusals: Local off -> 422 "Local is always on."; a place that isn't the business's -> 422; Local under 4 ->
 *   422; more reaches than the plan allows -> 403 plan_required naming the plan that allows them (the app's plan
 *   refusal, not the sprint's 402); more everyday questions than the plan's -> 402 question_limit with appendix E's
 *   sentence (as P02/P04 and the contract's P01.overLimit, not the sprint's 422).
 * - PUT Local 4 + NSW 3 + Australia 3: 200; the rows written; the Audit Trail entry; the draft is the set's first 4
 *   Local questions and its 3 naming the business, then 3 NSW and 3 Australia questions written as suggestions in
 *   those reaches; nothing applied (the current set is unchanged).
 * - The draft applies (201) with visibility_reach on; with it off, apply still refuses a question beyond Local.
 * - Turning NSW off leaves no NSW question in the next draft, and its row disabled.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeQuestionSetHash } from "@/lib/questions/hash";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const OWNER = randomUUID();
const VIEWER = randomUUID();
const BRAND = randomUUID();
const OTHER_BRAND = randomUUID();

const current = vi.hoisted(() => ({ user: { id: "", organizationId: "", role: "owner" } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => current.user) }));

let sql: ReturnType<typeof postgres>;
const EVERYDAY = [
  "Who is the best plumber in Chatswood?",
  "Which plumber near Chatswood can come today?",
  "Who fixes blocked drains in Chatswood?",
  "Best hot water repairs in Chatswood?",
  "Who installs water filters in Chatswood?",
  "Which Chatswood plumber is cheapest?",
  "Who repairs leaking taps in Chatswood?",
  "Emergency plumber in Chatswood at night?",
  "Who does bathroom plumbing in Chatswood?",
  "Which plumbers in Chatswood have good reviews?",
];
const BRANDED = [
  "Is Kookaburra Reach Plumbing reputable?",
  "What do customers say about Kookaburra Reach Plumbing?",
];

type Reach = { reach: string; enabled: boolean; place?: unknown; targetCount: number };
const LOCAL_PLACE = { suburb: "Chatswood", state: "NSW", postcode: "2067" };
const threeReaches = (local = 4, state = 3, country = 3): Reach[] => [
  { reach: "local", enabled: true, place: LOCAL_PLACE, targetCount: local },
  { reach: "state", enabled: true, place: { state: "NSW" }, targetCount: state },
  { reach: "country", enabled: true, place: { country: "AU" }, targetCount: country },
  { reach: "global", enabled: false, place: null, targetCount: 0 },
];

async function setFlag(flag: string, on: boolean) {
  await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${ORG}, ${flag}, ${on})
    ON CONFLICT (organization_id, flag_key) DO UPDATE SET is_enabled = ${on}`;
}
async function setPlan(tier: string) {
  await sql`UPDATE subscriptions SET tier = ${tier} WHERE organization_id = ${ORG}`;
}

async function get(brandId = BRAND) {
  const { GET } = await import("@/app/api/brands/[brandId]/reaches/route");
  const res = await GET(new Request(`http://localhost/api/brands/${brandId}/reaches`), {
    params: Promise.resolve({ brandId }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function put(reaches: unknown, brandId = BRAND) {
  const { PUT } = await import("@/app/api/brands/[brandId]/reaches/route");
  const res = await PUT(
    new Request(`http://localhost/api/brands/${brandId}/reaches`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaches }),
    }),
    { params: Promise.resolve({ brandId }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function apply(body: unknown) {
  const { POST } = await import("@/app/api/brands/[brandId]/question-sets/route");
  const res = await POST(
    new Request(`http://localhost/api/brands/${BRAND}/question-sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ brandId: BRAND }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

type DraftItem = {
  key: string;
  questionId: string;
  text: string;
  kind: string;
  source: string;
  reach: string;
};
type Draft = { baseVersion: number; items: DraftItem[]; archive: string[] };
type View = {
  reaches: Array<{
    reach: string;
    title: string;
    label: string;
    available: boolean;
    enabled: boolean;
    place: unknown;
    targetCount: number;
  }>;
  plan: { key: string; name: string; reachesAllowed: number };
  plansForReaches: Record<string, { key: string; name: string }>;
  everydayAllowed: number;
  everydayMin: number;
  localMin: number;
  stateCapital: string | null;
  areas: string[];
  suggestions: unknown[];
  packsOffered: boolean;
};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  for (const org of [ORG, OTHER_ORG]) {
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`reach-${org}`}, 'Reach Settings Org', ${`reach-${org}`})`;
    await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                         tier, billing_interval, status)
      VALUES (${org}, ${`cus_${org}`}, ${`sub_${org}`}, 'price_test', 'agency', 'monthly', 'active')`;
    for (const flag of ["agency_questions", "visibility_reach"])
      await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${org}, ${flag}, true)`;
  }
  for (const [id, role] of [
    [OWNER, "owner"],
    [VIEWER, "viewer"],
  ] as const) {
    await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`reach-${id}`}, ${ORG}, ${`${role}-${id}@reach.example.com.au`}, ${role}, ${role})`;
    await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG}, ${id}, ${role}, now(), now(), true)`;
  }
  for (const [id, org] of [
    [BRAND, ORG],
    [OTHER_BRAND, OTHER_ORG],
  ] as const) {
    await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state,
                                  postcode, categories, audience, classification, classification_status)
      VALUES (${id}, ${org}, 'Kookaburra Reach Plumbing', ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
              ARRAY['NSW:Chatswood'], 'Chatswood', 'NSW', '2067', ARRAY['trades_plumbing']::text[], 'households',
              ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
              'complete')`;
  }
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${ORG}, ${BRAND}, 1, true, ${computeQuestionSetHash(EVERYDAY) as string}) RETURNING id`;
  for (const [i, text] of [...EVERYDAY, ...BRANDED].entries()) {
    const kind = i < EVERYDAY.length ? "everyday" : "branded";
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${ORG}, ${BRAND}, ${text}, question_text_key(${text}), ${kind}, 'original') RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${ORG}, ${q.id}, ${i}, ${kind}, 'local', 'original')`;
  }
  current.user = { id: OWNER, organizationId: ORG, role: "owner" };
}, 60_000);

afterAll(async () => {
  const orgs = [ORG, OTHER_ORG];
  await sql`DELETE FROM audit_trail WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_visibility_scopes WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brands WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM users WHERE id = ANY(${[OWNER, VIEWER]})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
});

describe("/api/brands/:id/reaches", () => {
  it("404 with visibility_reach off, and for another workspace's brand", async () => {
    await setFlag("visibility_reach", false);
    expect((await get()).status).toBe(404);
    expect((await put(threeReaches())).status).toBe(404);
    await setFlag("visibility_reach", true);
    expect((await get(OTHER_BRAND)).status).toBe(404);
    expect((await put(threeReaches(), OTHER_BRAND)).status).toBe(404);
  });

  it("GET: a brand with no reach row is Local only, with its set's everyday questions", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const view = res.body as unknown as View;
    expect(view.reaches).toEqual([
      {
        reach: "local",
        title: "Local",
        label: "Local · Chatswood",
        available: true,
        enabled: true,
        place: LOCAL_PLACE,
        targetCount: 10,
      },
      {
        reach: "state",
        title: "State",
        label: "NSW",
        available: true,
        enabled: false,
        place: { state: "NSW" },
        targetCount: 0,
      },
      {
        reach: "country",
        title: "Country",
        label: "Australia",
        available: true,
        enabled: false,
        place: { country: "AU" },
        targetCount: 0,
      },
      {
        reach: "global",
        title: "Worldwide",
        label: "Worldwide",
        available: true,
        enabled: false,
        place: {},
        targetCount: 0,
      },
    ]);
    expect(view.plan).toEqual({ key: "agency", name: "Agency", reachesAllowed: 4 });
    expect(view.everydayAllowed).toBe(10);
    expect(view.localMin).toBe(4);
    expect(view.stateCapital).toBe("Sydney");
    expect(view.areas).toEqual(["NSW:Chatswood"]);
    expect(view.suggestions).toEqual([]);
  });

  it("PUT refusals: role, Local off, place, Local under 4, plan reach limit (403), everyday limit (402)", async () => {
    current.user = { id: VIEWER, organizationId: ORG, role: "viewer" };
    expect((await put(threeReaches())).status).toBe(403);
    current.user = { id: OWNER, organizationId: ORG, role: "owner" };

    const localOff = threeReaches().map((r) =>
      r.reach === "local" ? { ...r, enabled: false } : r,
    );
    expect(await put(localOff)).toEqual({
      status: 422,
      body: { error: "invalid_reaches", message: "Local is always on." },
    });
    const wrongPlace = threeReaches().map((r) =>
      r.reach === "state" ? { ...r, place: { state: "VIC" } } : r,
    );
    expect((await put(wrongPlace)).body.message).toBe(
      "This place doesn't match the business's location.",
    );
    expect((await put(threeReaches(3, 4, 3))).body.message).toBe(
      "Local · Chatswood needs at least 4 questions.",
    );

    await setPlan("growth");
    expect(await put(threeReaches())).toEqual({
      status: 403,
      body: { error: "This is part of the Agency plan", code: "plan_required", plan: "agency" },
    });
    await setPlan("agency");
    expect(await put(threeReaches(4, 4, 3))).toEqual({
      status: 402,
      body: {
        error: "question_limit",
        message:
          "Your plan includes 10 everyday questions per brand. Remove one, or add a question pack.",
        limit: 10,
      },
    });
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM brand_visibility_scopes WHERE brand_id = ${BRAND}`;
    expect(n).toBe(0);
  });

  let draft: Draft;
  it("PUT Local 4 + NSW 3 + Australia 3: rows, Audit Trail, and a draft with each reach's questions", async () => {
    const res = await put(threeReaches());
    expect(res.status).toBe(200);
    draft = res.body.draft as Draft;
    const view = res.body as unknown as View;
    expect(view.reaches.map((r) => [r.reach, r.enabled, r.targetCount])).toEqual([
      ["local", true, 4],
      ["state", true, 3],
      ["country", true, 3],
      ["global", false, 0],
    ]);
    const rows =
      await sql`SELECT reach, enabled, place, target_count, updated_by FROM brand_visibility_scopes
      WHERE brand_id = ${BRAND} ORDER BY reach`;
    expect(rows.map((r) => ({ ...r }))).toEqual([
      {
        reach: "country",
        enabled: true,
        place: { country: "AU" },
        target_count: 3,
        updated_by: OWNER,
      },
      { reach: "local", enabled: true, place: LOCAL_PLACE, target_count: 4, updated_by: OWNER },
      {
        reach: "state",
        enabled: true,
        place: { state: "NSW" },
        target_count: 3,
        updated_by: OWNER,
      },
    ]);
    const [trail] = await sql<{ metadata: { reaches: unknown } }[]>`
      SELECT metadata FROM audit_trail WHERE organization_id = ${ORG} AND action = 'brand_reaches_changed'`;
    expect(trail.metadata.reaches).toEqual([
      { reach: "local", targetCount: 4 },
      { reach: "state", targetCount: 3 },
      { reach: "country", targetCount: 3 },
    ]);

    expect(draft.baseVersion).toBe(1);
    expect(draft.items.slice(0, 6).map((i) => [i.text, i.kind, i.reach, i.source])).toEqual([
      ...EVERYDAY.slice(0, 4).map((t) => [t, "everyday", "local", "original"]),
      ...BRANDED.map((t) => [t, "branded", "local", "original"]),
    ]);
    const added = draft.items.slice(6);
    expect(added.map((i) => [i.reach, i.kind, i.source])).toEqual([
      ...Array(3).fill(["state", "everyday", "template"]),
      ...Array(3).fill(["country", "everyday", "template"]),
    ]);
    for (const i of added.slice(0, 3)) expect(i.text).toMatch(/\bNSW\b/);
    for (const i of added.slice(3)) expect(i.text).toMatch(/\bAustralian?\b/);
    const library = await sql<{ id: string; reach: string; status: string }[]>`
      SELECT id, reach, status FROM brand_questions WHERE id = ANY(${added.map((i) => i.questionId)})`;
    expect(library.every((q) => q.status === "suggested")).toBe(true);
    expect(library.filter((q) => q.reach === "state")).toHaveLength(3);

    const [setNow] = await sql<{ version: number }[]>`
      SELECT version FROM brand_question_sets WHERE brand_id = ${BRAND} AND is_current`;
    expect(setNow.version).toBe(1);
  });

  it("the draft applies with visibility_reach on; with it off a question beyond Local is refused", async () => {
    const items = draft.items.map((i, position) => ({
      questionId: i.questionId,
      reach: i.reach,
      position,
    }));
    await setFlag("visibility_reach", false);
    const refused = await apply({ baseVersion: 1, items, count: 10 });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.body)).toContain("Only Local questions for now.");
    await setFlag("visibility_reach", true);
    expect(await apply({ baseVersion: 1, items, count: 10 })).toEqual({
      status: 201,
      body: { version: 2 },
    });
    const reaches = await sql<{ reach: string; n: number }[]>`
      SELECT i.reach, count(*)::int AS n FROM brand_question_set_items i
      JOIN brand_question_sets s ON s.id = i.set_id AND s.is_current
      WHERE s.brand_id = ${BRAND} AND i.kind = 'everyday' GROUP BY i.reach ORDER BY i.reach`;
    expect(reaches.map((r) => ({ ...r }))).toEqual([
      { reach: "country", n: 3 },
      { reach: "local", n: 4 },
      { reach: "state", n: 3 },
    ]);
  });

  it("turning NSW off: its row disabled and no NSW question in the draft", async () => {
    const reaches = threeReaches(7, 0, 3).map((r) =>
      r.reach === "state" ? { ...r, enabled: false, place: null } : r,
    );
    const res = await put(reaches);
    expect(res.status).toBe(200);
    const next = res.body.draft as Draft;
    expect(next.baseVersion).toBe(2);
    expect(next.items.some((i) => i.reach === "state")).toBe(false);
    expect(next.items.filter((i) => i.reach === "country")).toHaveLength(3);
    expect(next.items.filter((i) => i.reach === "local" && i.kind === "everyday")).toHaveLength(4);
    const [state] = await sql<{ enabled: boolean; target_count: number }[]>`
      SELECT enabled, target_count FROM brand_visibility_scopes WHERE brand_id = ${BRAND} AND reach = 'state'`;
    expect({ ...state }).toEqual({ enabled: false, target_count: 0 });
  });
});
