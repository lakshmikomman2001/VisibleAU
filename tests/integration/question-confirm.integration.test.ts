/**
 * S03 part 7 (LLD 8.3.6, client request C4; contract P10 step 3): the Questions step on "Confirm your business
 * details", through the real routes.
 * - POST /api/brands/:id/questions/confirm-preview: the generator's pack for the unsaved facts and the brand's place
 *   (the workspace's everyday count), spares to swap in and what the plan allows; it writes nothing.
 * - PATCH confirm-classification with `questions`: exactly the list shown becomes the brand's set version 1 (a swapped-in
 *   suggestion, an agency-written question, the rest of the pack, in order), the brand's pack with today's generator,
 *   so the first audit asks exactly it (getAuditQuestions); the Audit Trail has the apply.
 * - Refusals roll the whole confirm back (the brand still needs confirming): Starter writing its own question (403
 *   plan_required, while a swap is fine), a question the step never offered claimed as the generator's (422), fewer
 *   than 5 everyday (422).
 * - agency_questions off: the preview 404s and `questions` is ignored -- the pack regenerates as before.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const AGENCY_ORG = randomUUID();
const STARTER_ORG = randomUUID();
const OWNER = randomUUID();
const STARTER_OWNER = randomUUID();
const NEW_BRAND = randomUUID();
const STARTER_BRAND = randomUUID();
const OFF_BRAND = randomUUID();
const TYPED = "Who fixes burst pipes in Chatswood quickly?";
// Two types: one type has at most 10 everyday templates (plumbing 9), so spares come from the second.
const FACTS = {
  categories: ["trades_plumbing", "trades_electrical"],
  audience: "households",
  confirmedCompetitors: [],
};

const current = vi.hoisted(() => ({ user: { id: "", organizationId: "", role: "owner" } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => current.user) }));

let sql: ReturnType<typeof postgres>;

interface Offered {
  text: string;
  kind: "everyday" | "branded";
  source: "original" | "template";
}
interface Preview {
  reachLabel: string;
  questions: Offered[];
  spares: Offered[];
  limits: { canWriteQuestions: boolean; canSwap: boolean; everydayAllowed: number };
}

async function preview(brandId: string) {
  const { POST } = await import("@/app/api/brands/[brandId]/questions/confirm-preview/route");
  const res = await POST(
    new Request(`http://localhost/api/brands/${brandId}/questions/confirm-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(FACTS),
    }),
    { params: Promise.resolve({ brandId }) },
  );
  return { status: res.status, body: (await res.json()) as Preview };
}
async function confirm(brandId: string, questions?: Array<{ text: string; source: string }>) {
  const { PATCH } = await import("@/app/api/brands/[brandId]/confirm-classification/route");
  const res = await PATCH(
    new Request(`http://localhost/api/brands/${brandId}/confirm-classification`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...FACTS, ...(questions ? { questions } : {}) }),
    }),
    { params: Promise.resolve({ brandId }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const as = (id: string, organizationId: string) => {
  current.user = { id, organizationId, role: "owner" };
};
const status = async (brandId: string) =>
  (
    await sql<{ s: string }[]>`SELECT classification_status AS s FROM brands WHERE id = ${brandId}`
  )[0].s;
const shownFrom = (p: Preview): Array<{ text: string; source: string }> =>
  p.questions.map((q) => ({ text: q.text, source: q.source }));

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  for (const [org, tier, owner] of [
    [AGENCY_ORG, "agency", OWNER],
    [STARTER_ORG, "starter", STARTER_OWNER],
  ] as const) {
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`qconfirm-${org}`}, 'Possum Marketing', ${`qconfirm-${org}`})`;
    await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                         tier, billing_interval, status)
      VALUES (${org}, ${`cus_${org}`}, ${`sub_${org}`}, 'price_test', ${tier}, 'monthly', 'active')`;
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${org}, 'agency_questions', true)`;
    await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${owner}, ${`qconfirm-${owner}`}, ${org}, ${`owner-${owner}@qconfirm.example.com.au`}, 'Pat Owner', 'owner')`;
    await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${org}, ${owner}, 'owner', now(), now(), true)`;
  }
  // New brands from the wizard: place confirmed, type still to confirm, no audit, no questions yet.
  for (const [id, org, name] of [
    [NEW_BRAND, AGENCY_ORG, "Wattlebird Plumbing"],
    [STARTER_BRAND, STARTER_ORG, "Kookaburra Plumbing"],
    [OFF_BRAND, AGENCY_ORG, "Galah Plumbing"],
  ] as const) {
    await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state,
                                  country, location_mode, location_confirmed_at, classification_status)
      VALUES (${id}, ${org}, ${name}, ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
              ARRAY['NSW:Chatswood']::text[], 'Chatswood', 'NSW', 'Australia', 'fixed', now(), 'needs_confirmation')`;
  }
}, 60_000);

afterAll(async () => {
  const orgs = [AGENCY_ORG, STARTER_ORG];
  await sql`DELETE FROM audit_trail WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brands WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM users WHERE id = ANY(${[OWNER, STARTER_OWNER]})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
});

describe("the preview", () => {
  it("the pack for the unsaved facts and the brand's place, spares, the plan's rules; nothing written", async () => {
    as(OWNER, AGENCY_ORG);
    const res = await preview(NEW_BRAND);
    expect(res.status).toBe(200);
    const everyday = res.body.questions.filter((q) => q.kind === "everyday");
    expect(everyday).toHaveLength(10);
    expect(everyday.every((q) => q.source === "original")).toBe(true);
    expect(res.body.questions.some((q) => q.kind === "branded")).toBe(true);
    expect(res.body.spares.length).toBeGreaterThan(0);
    expect(res.body.reachLabel).toBe("Local · Chatswood");
    expect(res.body.limits).toMatchObject({
      canWriteQuestions: true,
      canSwap: true,
      everydayAllowed: 10,
    });
    expect(await status(NEW_BRAND)).toBe("needs_confirmation");
    expect(await sql`SELECT 1 FROM brand_questions WHERE brand_id = ${NEW_BRAND}`).toHaveLength(0);
  });
});

describe("confirming with the questions shown", () => {
  it("fewer than 5 everyday: 422, and nothing is saved", async () => {
    as(OWNER, AGENCY_ORG);
    const p = (await preview(NEW_BRAND)).body;
    const few = [
      ...p.questions.filter((q) => q.kind === "everyday").slice(0, 4),
      ...p.questions.filter((q) => q.kind === "branded"),
    ].map((q) => ({ text: q.text, source: q.source }));
    expect((await confirm(NEW_BRAND, few)).status).toBe(422);
    expect(await status(NEW_BRAND)).toBe("needs_confirmation");
    expect(await sql`SELECT 1 FROM brand_questions WHERE brand_id = ${NEW_BRAND}`).toHaveLength(0);
  });

  it("a question the step never offered, claimed as the generator's: 422, nothing saved", async () => {
    as(OWNER, AGENCY_ORG);
    const shown = shownFrom((await preview(NEW_BRAND)).body);
    shown[0] = { text: "Who is the cheapest plumber in Chatswood?", source: "original" };
    const res = await confirm(NEW_BRAND, shown);
    expect(res).toMatchObject({ status: 422, body: { error: "questions_changed" } });
    expect(await status(NEW_BRAND)).toBe("needs_confirmation");
  });

  it("exactly what was shown becomes version 1 and the pack; the first audit asks it", async () => {
    as(OWNER, AGENCY_ORG);
    const p = (await preview(NEW_BRAND)).body;
    const shown = shownFrom(p);
    const swappedOut = shown[0].text;
    shown[0] = { text: p.spares[0].text, source: p.spares[0].source };
    shown[1] = { text: TYPED, source: "agency" };
    const res = await confirm(NEW_BRAND, shown);
    expect(res.status).toBe(200);
    expect(await status(NEW_BRAND)).toBe("complete");

    const sets = await sql<{ id: string; version: number; is_current: boolean }[]>`
      SELECT id, version, is_current FROM brand_question_sets WHERE brand_id = ${NEW_BRAND}`;
    expect(sets).toEqual([{ id: sets[0].id, version: 1, is_current: true }]);
    const items = await sql<{ text: string; source: string }[]>`
      SELECT q.text, i.source FROM brand_question_set_items i JOIN brand_questions q ON q.id = i.question_id
      WHERE i.set_id = ${sets[0].id} ORDER BY i.position`;
    expect(items.map((i) => i.text)).toEqual(shown.map((s) => s.text));
    expect(items.map((i) => i.source).slice(0, 3)).toEqual([
      p.spares[0].source,
      "agency",
      "original",
    ]);
    const [brand] = await sql<{ prompt_pack: string[]; v: number }[]>`
      SELECT prompt_pack, prompt_pack_generator_version AS v FROM brands WHERE id = ${NEW_BRAND}`;
    expect(brand.prompt_pack).toEqual(shown.map((s) => s.text));
    const { PROMPT_GENERATOR_VERSION } = await import("@/lib/prompts/generator-version");
    expect(brand.v).toBe(PROMPT_GENERATOR_VERSION);
    // The swapped-out question stays in the library as a suggestion.
    const [out] = await sql<{ status: string }[]>`
      SELECT status FROM brand_questions WHERE brand_id = ${NEW_BRAND} AND text = ${swappedOut}`;
    expect(out.status).toBe("suggested");

    // The first audit asks exactly these, the agency's question with its library id (so its answers are labelled).
    const { getAuditQuestions } = await import("@/lib/audit/get-audit-prompts");
    const [row] = await sql<{ id: string }[]>`SELECT id FROM brands WHERE id = ${NEW_BRAND}`;
    const { serviceDb } = await import("@/db/client");
    const { brands } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [full] = await serviceDb.select().from(brands).where(eq(brands.id, row.id));
    const asked = await getAuditQuestions(full);
    expect(asked.setId).toBe(sets[0].id);
    expect(asked.prompts.map((q) => q.text)).toEqual(shown.map((s) => s.text));
    expect(asked.prompts[1].questionId).toBeTruthy();

    const [trail] = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM audit_trail WHERE organization_id = ${AGENCY_ORG} AND action = 'brand_questions_applied'`;
    expect(trail.metadata).toMatchObject({ version: 1, from: "confirm" });
  });

  it("Starter: its own question is 403 plan_required and nothing is saved; a swap is fine", async () => {
    as(STARTER_OWNER, STARTER_ORG);
    const p = (await preview(STARTER_BRAND)).body;
    expect(p.limits).toMatchObject({ canWriteQuestions: false, canSwap: true });
    const typed = shownFrom(p);
    typed[1] = { text: TYPED, source: "agency" };
    const refused = await confirm(STARTER_BRAND, typed);
    expect(refused).toMatchObject({ status: 403, body: { code: "plan_required", plan: "growth" } });
    expect(await status(STARTER_BRAND)).toBe("needs_confirmation");
    expect(await sql`SELECT 1 FROM brand_questions WHERE brand_id = ${STARTER_BRAND}`).toHaveLength(
      0,
    );

    const swapped = shownFrom(p);
    swapped[0] = { text: p.spares[0].text, source: p.spares[0].source };
    expect((await confirm(STARTER_BRAND, swapped)).status).toBe(200);
    const [set] = await sql<{ version: number }[]>`
      SELECT version FROM brand_question_sets WHERE brand_id = ${STARTER_BRAND} AND is_current`;
    expect(set.version).toBe(1);
  });
});

describe("agency_questions off", () => {
  it("the preview 404s; questions sent anyway are ignored and the pack regenerates as before", async () => {
    as(OWNER, AGENCY_ORG);
    const p = (await preview(OFF_BRAND)).body;
    await sql`UPDATE org_feature_flags SET is_enabled = false WHERE organization_id = ${AGENCY_ORG}`;
    try {
      expect((await preview(OFF_BRAND)).status).toBe(404);
      const shown = shownFrom(p);
      shown[1] = { text: TYPED, source: "agency" };
      expect((await confirm(OFF_BRAND, shown)).status).toBe(200);
      const items = await sql<{ text: string; source: string }[]>`
        SELECT q.text, i.source FROM brand_question_sets s
        JOIN brand_question_set_items i ON i.set_id = s.id JOIN brand_questions q ON q.id = i.question_id
        WHERE s.brand_id = ${OFF_BRAND} AND s.is_current ORDER BY i.position`;
      expect(items.map((i) => i.text)).not.toContain(TYPED);
      expect(items.every((i) => i.source === "original")).toBe(true);
    } finally {
      await sql`UPDATE org_feature_flags SET is_enabled = true WHERE organization_id = ${AGENCY_ORG}`;
    }
  });
});
