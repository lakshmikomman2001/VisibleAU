/**
 * S01 part 5 (LLD 8.1.3, contract P08): the report contents panel's routes on a real database.
 * - GET/PUT /api/brands/:id/report-preferences, POST/PATCH/DELETE /api/brands/:id/agency-actions.
 * - 401 signed out; 403 a viewer (no generate_reports); 404 another workspace's brand; below the plan, the app's plan
 *   refusal (403, code plan_required: lib/pricing/plan-refusal.ts) -- reports Growth and up; agency actions, choices,
 *   notes and toggles Agency and up; Growth may save its default report type. (The sprint says 402; see the S01 report.)
 * - report_v2 off: GET says `{ enabled: false }`, PUT and the agency-action routes answer 404.
 * - Validation (400 with the rule's words); an XSS payload is stored as typed (text: React and react-pdf print it).
 * - Every write lands under the workspace (RLS context), and choices replace the saved list.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const USER = randomUUID();
const BRAND = randomUUID();
const OTHER_BRAND = randomUUID();
const ITEM = randomUUID();
const XSS = '<script>alert("x")</script> **bold**';
const who = vi.hoisted(() => ({ role: "owner" as "owner" | "viewer", signedIn: true }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () =>
    who.signedIn
      ? {
          id: USER,
          organizationId: ORG,
          role: who.role,
          organization: { id: ORG, name: "Possum Marketing", region: "au", metadata: {} },
        }
      : null,
  ),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });

async function setPlan(tier: string | null) {
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  if (tier) {
    await sql`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, ${`price_test_${tier}`}, ${tier}, 'monthly', 'active')
    `;
  }
}

async function setFlag(on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG} AND flag_key = 'report_v2'`;
  if (on)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${ORG}, 'report_v2', true)`;
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  for (const [org, name] of [
    [ORG, "Possum Marketing"],
    [OTHER_ORG, "Other Agency"],
  ] as const) {
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${org}, ${`rc-${org}`}, ${name}, ${`rc-${org}`})`;
  }
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER}, ${`rc-${USER}`}, ${ORG}, ${`owner-${ORG.slice(0, 8)}@rc.example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${USER}, 'owner', now(), now(), true)
  `;
  await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region) VALUES (${BRAND}, ${ORG}, 'Wren Home Services', ${`${BRAND.slice(0, 8)}.com.au`}, 'tradies', 'au')`;
  await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region) VALUES (${OTHER_BRAND}, ${OTHER_ORG}, 'Other Brand', ${`${OTHER_BRAND.slice(0, 8)}.com.au`}, 'tradies', 'au')`;
  await sql`
    INSERT INTO action_items (id, organization_id, brand_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, status)
    VALUES (${ITEM}, ${ORG}, ${BRAND}, 'directory-visibility', 'frequency', 'Link your Yellow Pages profile', 'Do it.', 'confirmed', 'high', 'open')
  `;
}, 30_000);

afterAll(async () => {
  for (const table of [
    "report_action_choices",
    "report_brand_preferences",
    "agency_actions",
    "action_items",
    "org_feature_flags",
    "subscriptions",
    "org_members",
  ]) {
    await sql`DELETE FROM ${sql(table)} WHERE organization_id IN (${ORG}, ${OTHER_ORG})`;
  }
  await sql`DELETE FROM brands WHERE organization_id IN (${ORG}, ${OTHER_ORG})`;
  await sql`DELETE FROM users WHERE organization_id IN (${ORG}, ${OTHER_ORG})`;
  await sql`DELETE FROM organizations WHERE id IN (${ORG}, ${OTHER_ORG})`;
  await sql.end();
});

beforeEach(async () => {
  who.role = "owner";
  who.signedIn = true;
  await setPlan("agency");
  await setFlag(true);
});

const ctx = (brandId: string) => ({ params: Promise.resolve({ brandId }) });

async function prefs(method: "GET" | "PUT", body?: object, brandId = BRAND) {
  const mod = await import("@/app/api/brands/[brandId]/report-preferences/route");
  const req = new Request(`http://x/api/brands/${brandId}/report-preferences`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return method === "GET" ? mod.GET(req, ctx(brandId)) : mod.PUT(req, ctx(brandId));
}

async function agency(
  method: "POST" | "PATCH" | "DELETE",
  body?: object,
  query = "",
  brandId = BRAND,
) {
  const mod = await import("@/app/api/brands/[brandId]/agency-actions/route");
  const req = new Request(`http://x/api/brands/${brandId}/agency-actions${query}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return mod[method](req, ctx(brandId));
}

describe("who may", () => {
  it("401 signed out, 403 a viewer writing, 404 another workspace's brand", async () => {
    who.signedIn = false;
    expect((await prefs("GET")).status).toBe(401);
    expect((await agency("POST", { title: "Ask for reviews", priority: "high" })).status).toBe(401);
    who.signedIn = true;
    who.role = "viewer";
    await sql`UPDATE org_members SET role = 'viewer' WHERE organization_id = ${ORG}`;
    try {
      expect((await prefs("PUT", { includeGeneralAdvice: false })).status).toBe(403);
      expect((await agency("POST", { title: "Ask for reviews", priority: "high" })).status).toBe(
        403,
      );
    } finally {
      await sql`UPDATE org_members SET role = 'owner' WHERE organization_id = ${ORG}`;
      who.role = "owner";
    }
    expect((await prefs("GET", undefined, OTHER_BRAND)).status).toBe(404);
    expect(
      (await agency("POST", { title: "Ask for reviews", priority: "high" }, "", OTHER_BRAND))
        .status,
    ).toBe(404);
  });

  it("the plan refusal below the plan: Starter has no reports; Growth can't curate or add actions, but saves its default type", async () => {
    const { isPlanRefusal } = await import("@/lib/pricing/plan-refusal");
    await setPlan("starter");
    expect(await isPlanRefusal(await prefs("GET"))).toBe(true);
    await setPlan("growth");
    expect((await prefs("GET")).status).toBe(200);
    const curate = await prefs("PUT", { includeGeneralAdvice: false });
    expect(await isPlanRefusal(curate)).toBe(true);
    expect(await curate.json()).toMatchObject({ plan: "agency" });
    expect(
      await isPlanRefusal(await agency("POST", { title: "Ask for reviews", priority: "high" })),
    ).toBe(true);
    const tierOnly = await prefs("PUT", { defaultTier: "standard" });
    expect(tierOnly.status).toBe(200);
    expect(
      ((await tierOnly.json()) as { preferences: { defaultTier: string } }).preferences.defaultTier,
    ).toBe("standard");
  });
});

describe("report_v2 off", () => {
  it("GET says the panel is off; PUT and agency actions answer 404", async () => {
    await setFlag(false);
    const res = await prefs("GET");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect((await prefs("PUT", { includeGeneralAdvice: false })).status).toBe(404);
    expect((await agency("POST", { title: "Ask for reviews", priority: "high" })).status).toBe(404);
  });
});

describe("Agency: saving", () => {
  it("GET opens with the curated view; PUT saves toggles and choices (an XSS note stored as typed)", async () => {
    const view = (await (await prefs("GET")).json()) as {
      enabled: boolean;
      curated: boolean;
      agencyName: string;
    };
    expect(view).toMatchObject({ enabled: true, curated: true, agencyName: "Possum Marketing" });
    const res = await prefs("PUT", {
      includeDoneSinceLast: false,
      choices: [{ actionItemId: ITEM, included: false, position: 0, note: XSS }],
    });
    expect(res.status).toBe(200);
    const [row] = await sql<{ included: boolean; note: string; organization_id: string }[]>`
      SELECT included, note, organization_id FROM report_action_choices WHERE brand_id = ${BRAND}`;
    expect(row).toEqual({ included: false, note: XSS, organization_id: ORG });
    const [p] = await sql<{ include_done_since_last: boolean }[]>`
      SELECT include_done_since_last FROM report_brand_preferences WHERE brand_id = ${BRAND}`;
    expect(p.include_done_since_last).toBe(false);
    // Choices replace the saved list.
    expect((await prefs("PUT", { choices: [] })).status).toBe(200);
    expect(await sql`SELECT 1 FROM report_action_choices WHERE brand_id = ${BRAND}`).toHaveLength(
      0,
    );
  });

  it("400 with the rule's words: a long note, an action that isn't the brand's, bad JSON", async () => {
    const long = await prefs("PUT", {
      choices: [{ actionItemId: ITEM, included: true, position: 0, note: "x".repeat(401) }],
    });
    expect(long.status).toBe(400);
    expect(await long.json()).toEqual({
      error: "choices.0.note: A note is 400 characters or fewer.",
    });
    const foreign = await prefs("PUT", {
      choices: [{ actionItemId: randomUUID(), included: true, position: 0, note: null }],
    });
    expect(foreign.status).toBe(400);
    const mod = await import("@/app/api/brands/[brandId]/report-preferences/route");
    const bad = await mod.PUT(new Request("http://x", { method: "PUT", body: "{" }), ctx(BRAND));
    expect(bad.status).toBe(400);
  });

  it("agency actions: add (title stored as typed), change, archive; refused titles and unknown ids", async () => {
    const created = await agency("POST", {
      title: `  ${XSS}  `,
      detail: "By December",
      priority: "high",
    });
    expect(created.status).toBe(201);
    const { action } = (await created.json()) as {
      action: { id: string; title: string; organizationId: string };
    };
    expect(action.title).toBe(XSS);
    expect(action.organizationId).toBe(ORG);
    expect((await agency("POST", { title: "Shrt", priority: "low" })).status).toBe(400);
    const changed = await agency("PATCH", { id: action.id, status: "in_progress" });
    expect(changed.status).toBe(200);
    expect((await agency("PATCH", { id: randomUUID(), status: "done" })).status).toBe(404);
    expect((await agency("DELETE", undefined, `?id=${action.id}`)).status).toBe(204);
    expect((await agency("DELETE", undefined, `?id=${action.id}`)).status).toBe(404);
    const [row] = await sql<
      { archived: boolean }[]
    >`SELECT archived_at IS NOT NULL AS archived FROM agency_actions WHERE id = ${action.id}`;
    expect(row.archived).toBe(true);
  });
});
