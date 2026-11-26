/**
 * S03 part 4 (LLD 8.3.1; contract P02 edit mode): what GET /api/brands/:id/questions tells the page about editing --
 * editable only with agency_questions on, for a role that edits, on a plan that edits (not Free); the limits the apply
 * route enforces; the brand's name; who writes the agency's questions (report branding's agency name, else the
 * workspace's name).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const OWNER = randomUUID();
const VIEWER = randomUUID();
const BRAND = randomUUID();

const current = vi.hoisted(() => ({ user: { id: "", organizationId: "", role: "owner" } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => current.user) }));

let sql: ReturnType<typeof postgres>;

async function get() {
  const { GET } = await import("@/app/api/brands/[brandId]/questions/route");
  const res = await GET(new Request(`http://localhost/api/brands/${BRAND}/questions`), {
    params: Promise.resolve({ brandId: BRAND }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function flag(key: string, on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG} AND flag_key = ${key}`;
  await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${ORG}, ${key}, ${on})`;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`route-edit-${ORG}`}, 'Numbat Digital', ${`route-edit-${ORG}`})`;
  await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier,
                                       billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test', 'agency', 'monthly', 'active')`;
  for (const [id, role] of [
    [OWNER, "owner"],
    [VIEWER, "viewer"],
  ] as const) {
    await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`route-edit-${id}`}, ${ORG}, ${`${role}-${id}@route-edit.example.com.au`}, ${role}, ${role})`;
    await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG}, ${id}, ${role}, now(), now(), true)`;
  }
  await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state)
    VALUES (${BRAND}, ${ORG}, 'Quokka Plumbing', 'quokkaplumbing.example.com.au', 'tradies', 'au',
            ARRAY['NSW:Chatswood'], 'Chatswood', 'NSW')`;
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${ORG}, ${BRAND}, 1, true, 'h') RETURNING id`;
  for (const [i, [text, kind]] of [
    ["Who is the best plumber in Chatswood?", "everyday"],
    ["Is Quokka Plumbing any good?", "branded"],
  ].entries()) {
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${ORG}, ${BRAND}, ${text}, question_text_key(${text}), ${kind}, 'original') RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${ORG}, ${q.id}, ${i}, ${kind}, 'local', 'original')`;
  }
  await flag("question_library", true);
  current.user = { id: OWNER, organizationId: ORG, role: "owner" };
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM agency_brand_assets WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM users WHERE id = ANY(${[OWNER, VIEWER]})`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("GET /api/brands/:id/questions: editing (S03 part 4)", () => {
  it("agency_questions off: not editable; the limits, the brand's name and the workspace's name", async () => {
    await flag("agency_questions", false);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.brandName).toBe("Quokka Plumbing");
    expect(res.body.agencyName).toBe("Numbat Digital");
    expect(res.body.limits).toMatchObject({
      plan: "agency",
      canEdit: true,
      editable: false,
      everydayAllowed: 10,
      everydayMin: 5,
      maxBranded: 5,
      canWriteQuestions: true,
    });
  });

  it("on: editable for an owner, not for a viewer, not on Free", async () => {
    await flag("agency_questions", true);
    expect(((await get()).body.limits as { editable: boolean }).editable).toBe(true);
    current.user = { id: VIEWER, organizationId: ORG, role: "viewer" };
    expect((await get()).body.limits).toMatchObject({ canEdit: false, editable: false });
    current.user = { id: OWNER, organizationId: ORG, role: "owner" };
    await sql`UPDATE subscriptions SET tier = 'free' WHERE organization_id = ${ORG}`;
    expect((await get()).body.limits).toMatchObject({ editable: false, canWriteQuestions: false });
    await sql`UPDATE subscriptions SET tier = 'starter' WHERE organization_id = ${ORG}`;
    expect((await get()).body.limits).toMatchObject({ editable: true, canWriteQuestions: false });
    await sql`UPDATE subscriptions SET tier = 'agency' WHERE organization_id = ${ORG}`;
  });

  it("report branding's agency name wins over the workspace's name", async () => {
    await sql`INSERT INTO agency_brand_assets (organization_id, brand_id, agency_name) VALUES (${ORG}, NULL, 'Possum Marketing')`;
    expect((await get()).body.agencyName).toBe("Possum Marketing");
  });
});
