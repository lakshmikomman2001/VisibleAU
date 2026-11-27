/**
 * S04 part 0d (LLD amendment 95; contract v1.9 P05.brands.table): Workspace -> Questions' "Last change", on the real
 * database and routes. A version the confirm screen's Questions step saved (PATCH confirm-classification with the
 * questions) is "Confirmed · {date} · {userName}"; one applied in P04 (POST question-sets) is "{date} · {userName}";
 * 0155's version 1 stays "Original questions · {date}" (it printed "backfill").
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const OWNER = randomUUID();
const BRAND = randomUUID();
const FACTS = {
  categories: ["trades_plumbing", "trades_electrical"],
  audience: "households",
  confirmedCompetitors: [],
};

const current = vi.hoisted(() => ({ user: { id: "", organizationId: "", role: "owner" } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => current.user) }));

let sql: ReturnType<typeof postgres>;

async function post(path: string, route: string, body: unknown, method = "POST") {
  const mod = (await import(route)) as Record<
    string,
    (req: Request, ctx: { params: Promise<{ brandId: string }> }) => Promise<Response>
  >;
  const res = await mod[method](
    new Request(`http://localhost${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ brandId: BRAND }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function lastChange() {
  const { serviceDb } = await import("@/db/client");
  const { loadQuestionSettings } = await import("@/lib/questions/settings");
  const { lastChangeText } = await import("@/components/domain/questions/question-settings");
  const view = await loadQuestionSettings(serviceDb, ORG);
  const row = view.brands.find((b) => b.id === BRAND);
  return row?.lastChange ? { ...row.lastChange, text: lastChangeText(row.lastChange) } : null;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`qlast-${ORG}`}, 'Possum Marketing', ${`qlast-${ORG}`})`;
  await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                       tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test', 'agency', 'monthly', 'active')`;
  await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${ORG}, 'agency_questions', true)`;
  await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`qlast-${OWNER}`}, ${ORG}, ${`owner-${OWNER}@qlast.example.com.au`}, 'Pat Owner', 'owner')`;
  await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${OWNER}, 'owner', now(), now(), true)`;
  await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state,
                                country, location_mode, location_confirmed_at, classification_status)
    VALUES (${BRAND}, ${ORG}, 'Wattlebird Plumbing', ${`${BRAND.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
            ARRAY['NSW:Chatswood']::text[], 'Chatswood', 'NSW', 'Australia', 'fixed', now(), 'needs_confirmation')`;
  current.user = { id: OWNER, organizationId: ORG, role: "owner" };
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM users WHERE id = ${OWNER}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("Workspace -> Questions: Last change", () => {
  it("a version the confirm screen saved: Confirmed · {date} · {userName}", async () => {
    const preview = await post(
      `/api/brands/${BRAND}/questions/confirm-preview`,
      "@/app/api/brands/[brandId]/questions/confirm-preview/route",
      FACTS,
    );
    expect(preview.status).toBe(200);
    const shown = (preview.body.questions as Array<{ text: string; source: string }>).map((q) => ({
      text: q.text,
      source: q.source,
    }));
    const confirmed = await post(
      `/api/brands/${BRAND}/confirm-classification`,
      "@/app/api/brands/[brandId]/confirm-classification/route",
      { ...FACTS, questions: shown },
      "PATCH",
    );
    expect(confirmed.status).toBe(200);
    const change = await lastChange();
    expect(change).toMatchObject({ by: "Pat Owner", backfill: false, confirmed: true });
    expect(change?.text).toMatch(/^Confirmed · \d{1,2} [A-Z][a-z]{2} \d{4} · Pat Owner$/);
  });

  it("a version applied in P04: {date} · {userName}", async () => {
    const items = await sql<{ question_id: string }[]>`
      SELECT i.question_id FROM brand_question_set_items i
      JOIN brand_question_sets s ON s.id = i.set_id AND s.is_current WHERE s.brand_id = ${BRAND} ORDER BY i.position`;
    const applied = await post(
      `/api/brands/${BRAND}/question-sets`,
      "@/app/api/brands/[brandId]/question-sets/route",
      {
        baseVersion: 1,
        items: items.map((i, position) => ({
          questionId: i.question_id,
          reach: "local",
          position,
        })),
      },
    );
    expect(applied.status).toBe(201);
    const change = await lastChange();
    expect(change).toMatchObject({ by: "Pat Owner", backfill: false, confirmed: false });
    expect(change?.text).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4} · Pat Owner$/);
  });
});
