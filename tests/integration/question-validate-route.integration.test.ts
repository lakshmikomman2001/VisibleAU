/**
 * S03 part 2 (LLD 8.3.2, 8.3.7; contract P03): POST /api/brands/:id/questions/validate on a real database -- the add
 * drawer's checks against the brand's live library, its current set's questions naming the business, its places and its
 * competitors; 401 signed out, 404 with the flag off or for another workspace's brand, 403 for a viewer, 403
 * plan_required below Growth (writing your own is Growth and up), 400 for a bad body.
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
const VIEWER = randomUUID();
const BRAND = randomUUID();
const OTHER_BRAND = randomUUID();

const current = vi.hoisted(() => ({
  user: null as null | { id: string; organizationId: string; role: string },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => current.user) }));

let sql: ReturnType<typeof postgres>;

async function validate(body: unknown, brandId = BRAND) {
  const { POST } = await import("@/app/api/brands/[brandId]/questions/validate/route");
  const res = await POST(
    new Request(`http://localhost/api/brands/${brandId}/questions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ brandId }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const status = (body: Record<string, unknown>, id: string) =>
  (body.checks as Array<{ id: string; status: string }>).find((c) => c.id === id)?.status ??
  "absent";

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  for (const org of [ORG, OTHER_ORG]) {
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`validate-${org}`}, 'Question Validate Org', ${`validate-${org}`})`;
    await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                         tier, billing_interval, status)
      VALUES (${org}, ${`cus_${org}`}, ${`sub_${org}`}, 'price_test', 'growth', 'monthly', 'active')`;
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${org}, 'agency_questions', true)`;
  }
  for (const [id, role] of [
    [OWNER, "owner"],
    [VIEWER, "viewer"],
  ] as const) {
    await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`validate-${id}`}, ${ORG}, ${`${role}-${id}@validate.example.com.au`}, ${role}, ${role})`;
    await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG}, ${id}, ${role}, now(), now(), true)`;
  }
  for (const [id, org] of [
    [BRAND, ORG],
    [OTHER_BRAND, OTHER_ORG],
  ] as const) {
    await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state,
                                  competitors, aliases)
      VALUES (${id}, ${org}, 'Wombat Plumbing', 'wombatplumbing.example.com.au', 'tradies', 'au',
              ARRAY['NSW:Chatswood'], 'Chatswood', 'NSW', ARRAY['Lane Cove Trades'], ARRAY['Wombat Plumbers'])`;
  }
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${ORG}, ${BRAND}, 1, true, 'h') RETURNING id`;
  const questions = [
    ["Who is the best plumber in Chatswood?", "everyday"],
    ...Array.from({ length: 5 }, (_, i) => [
      `Is Wombat Plumbing good for job ${i + 1}?`,
      "branded",
    ]),
  ];
  for (const [i, [text, kind]] of questions.entries()) {
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${ORG}, ${BRAND}, ${text}, question_text_key(${text}), ${kind}, 'original') RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${ORG}, ${q.id}, ${i}, ${kind}, 'local', 'original')`;
  }
  // An archived question's wording may be used again.
  await sql`INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source, status, archived_at)
    VALUES (${ORG}, ${BRAND}, 'Who fixes old taps in Chatswood?', question_text_key('Who fixes old taps in Chatswood?'),
            'everyday', 'agency', 'archived', now())`;
}, 60_000);

afterAll(async () => {
  const orgs = [ORG, OTHER_ORG];
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

describe("POST /api/brands/:id/questions/validate", () => {
  it("401 signed out", async () => {
    current.user = null;
    expect((await validate({ text: "Who fixes taps in Chatswood?", reach: "local" })).status).toBe(
      401,
    );
    current.user = { id: OWNER, organizationId: ORG, role: "owner" };
  });

  it("a good question: ok, everyday, the four lines passing", async () => {
    const res = await validate({
      text: "Which plumber in Chatswood fixes burst pipes?",
      reach: "local",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, kind: "everyday" });
    expect((res.body.checks as unknown[]).length).toBe(4);
  });

  it("checks against the brand's own data: its library, its current set's 5 naming it, its places, its competitors", async () => {
    expect(
      status(
        (await validate({ text: "who is the best plumber in chatswood?", reach: "local" })).body,
        "duplicate",
      ),
    ).toBe("fail");
    expect(
      status(
        (await validate({ text: "Who fixes old taps in Chatswood?", reach: "local" })).body,
        "duplicate",
      ),
    ).toBe("pass");
    const sixth = await validate({
      text: "Are Wombat Plumbers reliable in Chatswood?",
      reach: "local",
    });
    expect(sixth.body).toMatchObject({ ok: false, kind: "branded" });
    expect(status(sixth.body, "branded_limit")).toBe("fail");
    const noPlace = await validate({
      text: "Who fixes leaking hot water systems?",
      reach: "local",
    });
    // The fix adds the brand's region label (lib/brands/region-label.ts): a suburb with no curated city carries its
    // state, "Chatswood, NSW" (LLD amendment 8).
    expect(noPlace.body.checks).toContainEqual(
      expect.objectContaining({
        id: "place",
        status: "warn",
        fix: {
          label: "Add “in Chatswood, NSW”",
          text: "Who fixes leaking hot water systems in Chatswood, NSW?",
        },
      }),
    );
    expect(
      status(
        (await validate({ text: "Is Lane Cove Trades good in Chatswood?", reach: "local" })).body,
        "competitor",
      ),
    ).toBe("warn");
  });

  it("400 for a bad body; 404 with the flag off; a viewer 403; another workspace's brand 404", async () => {
    expect((await validate({ text: 7, reach: "local" })).status).toBe(400);
    expect((await validate({ text: "Who fixes taps?", reach: "moon" })).status).toBe(400);
    expect((await validate("not json")).status).toBe(400);
    expect(
      (await validate({ text: "Who fixes taps in Chatswood?", reach: "local" }, OTHER_BRAND))
        .status,
    ).toBe(404);
    current.user = { id: VIEWER, organizationId: ORG, role: "viewer" };
    expect((await validate({ text: "Who fixes taps in Chatswood?", reach: "local" })).status).toBe(
      403,
    );
    current.user = { id: OWNER, organizationId: ORG, role: "owner" };
    await sql`UPDATE org_feature_flags SET is_enabled = false WHERE organization_id = ${ORG}`;
    expect((await validate({ text: "Who fixes taps in Chatswood?", reach: "local" })).status).toBe(
      404,
    );
    await sql`UPDATE org_feature_flags SET is_enabled = true WHERE organization_id = ${ORG}`;
  });

  it("Starter (and Free) can't write their own questions: 403 plan_required, Growth", async () => {
    await sql`UPDATE subscriptions SET tier = 'starter' WHERE organization_id = ${ORG}`;
    const res = await validate({ text: "Who fixes taps in Chatswood?", reach: "local" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "plan_required", plan: "growth" });
    await sql`UPDATE subscriptions SET tier = 'growth' WHERE organization_id = ${ORG}`;
  });
});
