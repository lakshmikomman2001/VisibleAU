/**
 * S03 part 1 (LLD 7.6, 8.3.5; appendix E): a brand's question limits on a real database, and the check when an audit
 * starts.
 * - getQuestionLimits reads the workspace's plan as every gate does (a cancelled plan reads as Free) and the packs
 *   assigned to the brand, which count only on a plan that has packs (Growth and up);
 * - POST /api/audits, with agency_questions on, refuses a brand whose current set holds more everyday questions than it
 *   may run: 402 question_limit with appendix E's sentence, before any audit row; packs make room; with the flag off
 *   the route is as in S02 (the check doesn't run).
 * The workspace has already reached its daily spending limit, so a request that passes the question check stops at
 * that next gate (429) and never starts an audit.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const OWNER_ID = randomUUID();
const BRAND_ID = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: OWNER_ID, organizationId: ORG_ID, role: "owner" })),
}));

let sql: ReturnType<typeof postgres>;

async function setPlan(tier: string, status = "active") {
  await sql`UPDATE subscriptions SET tier = ${tier}, status = ${status} WHERE organization_id = ${ORG_ID}`;
}
async function setPacks(packs: number | null) {
  await sql`DELETE FROM brand_question_packs WHERE brand_id = ${BRAND_ID}`;
  if (packs !== null)
    await sql`INSERT INTO brand_question_packs (brand_id, organization_id, packs) VALUES (${BRAND_ID}, ${ORG_ID}, ${packs})`;
}
async function setFlag(on: boolean | null) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG_ID} AND flag_key = 'agency_questions'`;
  if (on !== null)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${ORG_ID}, 'agency_questions', ${on})`;
}

/** The brand's current set: `everyday` everyday questions and `branded` that name it, as version `version`. */
async function setQuestions(everyday: number, branded: number, version: number) {
  await sql`UPDATE brand_question_sets SET is_current = false WHERE brand_id = ${BRAND_ID}`;
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${ORG_ID}, ${BRAND_ID}, ${version}, true, ${`hash-${version}`}) RETURNING id`;
  const texts = [
    ...Array.from({ length: everyday }, (_, i) => [
      `Who is plumber number ${i + 1} near Chatswood v${version}?`,
      "everyday",
    ]),
    ...Array.from({ length: branded }, (_, i) => [
      `Is Limit Test Plumbing ok for job ${i + 1} v${version}?`,
      "branded",
    ]),
  ];
  for (const [i, [text, kind]] of texts.entries()) {
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${ORG_ID}, ${BRAND_ID}, ${text}, question_text_key(${text}), ${kind}, 'original') RETURNING id`;
    await sql`
      INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${ORG_ID}, ${q.id}, ${i}, ${kind}, 'local', 'original')`;
  }
}

async function audits(): Promise<number> {
  return Number(
    (
      await sql<{ c: string }[]>`SELECT count(*) AS c FROM audits WHERE organization_id = ${ORG_ID}`
    )[0].c,
  );
}

async function start(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/audits/route");
  const res = await POST(
    new Request("http://localhost/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: BRAND_ID }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function limits() {
  const { withRlsContext } = await import("@/db/client");
  const { getQuestionLimits } = await import("@/lib/questions/limits");
  return withRlsContext(ORG_ID, (tx) => getQuestionLimits(tx, ORG_ID, BRAND_ID));
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`question-limits-${ORG_ID}`}, 'Question Limits Org', ${`question-limits-${ORG_ID}`})`;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, classification_status,
                        classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Limit Test Plumbing', 'limittestplumbing.example.com.au', 'tradies', 'au',
            ARRAY[]::text[], 'complete',
            ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
            now(), 'fixed')`;
  await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER_ID}, ${`question-limits-${OWNER_ID}`}, ${ORG_ID}, ${`owner-${OWNER_ID}@question-limits.example.com.au`}, 'Owner', 'owner')`;
  await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${OWNER_ID}, 'owner', now(), now(), true)`;
  await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier,
                                       billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency', 'monthly', 'active')`;
  // Today's spending limit is already reached: a start that passes the question check stops there (429).
  const prior = randomUUID();
  await sql`INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, completed_at)
    VALUES (${prior}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'complete', now())`;
  await sql`INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, estimated_cost_cents,
                                              actual_cost_cents, prompt_count, provider_call_count)
    VALUES (${prior}, ${ORG_ID}, 'AU_EN', 'en-AU', 0, 999999, 0, 0)`;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brand_question_packs WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM audit_cost_snapshots WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE id = ${OWNER_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

describe("getQuestionLimits: the plan, and the brand's packs where the plan has them", () => {
  it("Agency: 10 everyday included, 5 naming the business, writes its own, 4 reaches; 2 packs make 30", async () => {
    await setPlan("agency");
    await setPacks(null);
    expect(await limits()).toEqual({
      plan: "agency",
      includedScoredQuestions: 10,
      packs: 0,
      everydayAllowed: 10,
      everydayMin: 5,
      maxBrandedQuestions: 5,
      canWriteQuestions: true,
      reachesAllowed: 4,
    });
    await setPacks(2);
    expect(await limits()).toMatchObject({ packs: 2, everydayAllowed: 30 });
  });

  it("Starter has no packs, so an assigned row counts for nothing; it doesn't write its own (D4)", async () => {
    await setPlan("starter");
    await setPacks(3);
    expect(await limits()).toMatchObject({
      plan: "starter",
      packs: 0,
      everydayAllowed: 10,
      canWriteQuestions: false,
      reachesAllowed: 1,
    });
  });

  it("a cancelled plan reads as Free, as every gate reads it", async () => {
    await setPlan("growth", "canceled");
    await setPacks(1);
    expect(await limits()).toMatchObject({ plan: "free", packs: 0, everydayAllowed: 10 });
    await setPlan("agency");
    await setPacks(null);
  });
});

describe("POST /api/audits checks the current set against the limits (agency_questions on)", () => {
  it("11 everyday on Agency: 402 question_limit with appendix E's sentence, and no audit row", async () => {
    await setPlan("agency");
    await setPacks(null);
    await setFlag(true);
    await setQuestions(11, 3, 1);
    const before = await audits();
    const res = await start();
    expect(res.status).toBe(402);
    expect(res.body).toEqual({
      error: "question_limit",
      message:
        "Your plan includes 10 everyday questions per brand. Remove one, or add a question pack.",
      limit: 10,
    });
    expect(await audits()).toBe(before);
  });

  it("a pack makes room: the same set passes the question check (and stops at the daily limit)", async () => {
    await setPacks(1);
    const res = await start();
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("daily_spend_cap_exceeded");
    await setPacks(null);
  });

  it("10 everyday and 5 naming the business pass", async () => {
    await setQuestions(10, 5, 2);
    expect((await start()).status).toBe(429);
  });

  it("with agency_questions off the check doesn't run: the route is as in S02", async () => {
    await setQuestions(12, 3, 3);
    await setFlag(false);
    expect((await start()).status).toBe(429);
    await setFlag(null);
    expect((await start()).status).toBe(429);
  });
});
