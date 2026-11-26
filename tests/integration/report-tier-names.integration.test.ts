/**
 * S01 part 10 (contract P18; LLD 7.5, 8.1.7 D-RT3, amendment 30): PUT /api/report-branding with reportTierNames.
 * - Agency owner: the names are stored on the workspace row (trimmed), with an audit-trail entry like other branding
 *   changes; the defaults store nothing (null); an XSS payload is stored as typed (React and react-pdf print text).
 * - 422 for a name outside 1-24 characters, with a control character, or the same as another ignoring case.
 * - Below Agency: 403 plan_required. An analyst (no manage_branding): 403. report_v2 off: 404.
 * - Names apply from now on: a report keeps the name in its snapshot (P17, P09.cover).
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
const who = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: who.id,
    organizationId: ORG,
    email: "someone@tier-names.example.com.au",
    name: "Someone",
    role: "member",
    organization: { id: ORG, name: "Possum Marketing", region: "au", metadata: {} },
  })),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });

async function setPlan(tier: string) {
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, ${`price_test_${tier}`}, ${tier}, 'monthly', 'active')`;
}

async function setFlag(on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${ORG}`;
  if (on)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${ORG}, 'report_v2', true)`;
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG}, ${`tn-${ORG}`}, 'Possum Marketing', ${`tn-${ORG}`})`;
  for (const [id, role] of [
    [OWNER, "owner"],
    [ANALYST, "analyst"],
  ] as const) {
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`tn-${id}`}, ${ORG}, ${`${role}-${id.slice(0, 8)}@tier-names.example.com.au`}, ${role}, 'member')`;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG}, ${id}, ${role}, now(), now(), true)`;
  }
}, 30_000);

afterAll(async () => {
  for (const table of [
    "audit_trail",
    "agency_brand_assets",
    "org_feature_flags",
    "subscriptions",
    "org_members",
  ])
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

beforeEach(async () => {
  who.id = OWNER;
  await setPlan("agency");
  await setFlag(true);
  await sql`DELETE FROM agency_brand_assets WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG}`;
});

async function put(reportTierNames: unknown) {
  const { PUT } = await import("@/app/api/report-branding/route");
  const res = await PUT(
    new Request("http://x/api/report-branding", {
      method: "PUT",
      body: JSON.stringify({ reportTierNames }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function stored(): Promise<unknown> {
  const [row] = await sql<{ report_tier_names: unknown }[]>`
    SELECT report_tier_names FROM agency_brand_assets WHERE organization_id = ${ORG} AND brand_id IS NULL`;
  return row?.report_tier_names ?? null;
}

describe("PUT /api/report-branding: report names", () => {
  it("an Agency owner saves the names (trimmed) on the workspace row, with an audit-trail entry", async () => {
    const { status } = await put({
      basic: " Essentials ",
      standard: "Growth Plan",
      enhanced: "Premium Audit",
    });
    expect(status).toBe(200);
    expect(await stored()).toEqual({
      basic: "Essentials",
      standard: "Growth Plan",
      enhanced: "Premium Audit",
    });
    const trail = await sql<{ action: string; metadata: { changed?: string[] } }[]>`
      SELECT action, metadata FROM audit_trail WHERE organization_id = ${ORG}`;
    expect(trail).toHaveLength(1);
    expect(trail[0].action).toBe("report_branding_changed");
    expect(trail[0].metadata.changed).toEqual(["reportTierNames"]);
  });

  it("the defaults store nothing (null), and saving the same names again changes nothing", async () => {
    await put({ basic: "Essentials", standard: "Growth Plan", enhanced: "Premium Audit" });
    expect((await put({ basic: "Basic", standard: "Standard", enhanced: "Enhanced" })).status).toBe(
      200,
    );
    expect(await stored()).toBeNull();
    await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG}`;
    expect((await put(null)).status).toBe(200);
    expect(await sql`SELECT 1 FROM audit_trail WHERE organization_id = ${ORG}`).toHaveLength(0);
  });

  it.each([
    ["25 characters", { basic: "x".repeat(25), standard: "Standard", enhanced: "Enhanced" }],
    ["empty after trimming", { basic: "   ", standard: "Standard", enhanced: "Enhanced" }],
    ["a line break", { basic: "Ess\nentials", standard: "Standard", enhanced: "Enhanced" }],
    [
      "the same as another ignoring case",
      { basic: "Premium", standard: "Standard", enhanced: "PREMIUM" },
    ],
  ])("422 for a name with %s", async (_why, names) => {
    const { status, body } = await put(names);
    expect(status).toBe(422);
    expect(body.error).toBe("Use 1–24 characters, different from your other report names.");
    expect(await stored()).toBeNull();
  });

  it("an XSS payload is stored as typed: it's text wherever it's shown", async () => {
    const payload = '<b onclick="x">Gold</b>';
    expect((await put({ basic: "Basic", standard: "Standard", enhanced: payload })).status).toBe(
      200,
    );
    expect(((await stored()) as { enhanced: string }).enhanced).toBe(payload);
  });

  it("below Agency: 403 plan_required, and nothing is stored", async () => {
    await setPlan("growth");
    const { status, body } = await put({ basic: "A plan", standard: "B plan", enhanced: "C plan" });
    expect(status).toBe(403);
    expect(body.code).toBe("plan_required");
    expect(await stored()).toBeNull();
  });

  it("an analyst can't change report branding (403)", async () => {
    who.id = ANALYST;
    expect((await put({ basic: "A plan", standard: "B plan", enhanced: "C plan" })).status).toBe(
      403,
    );
  });

  it("report_v2 off: 404 (the card isn't shown either)", async () => {
    await setFlag(false);
    expect((await put({ basic: "A plan", standard: "B plan", enhanced: "C plan" })).status).toBe(
      404,
    );
  });
});
