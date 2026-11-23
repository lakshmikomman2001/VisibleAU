/**
 * S01 parts 9-10 (contract P17; LLD 8.1.7): GET /api/brands/:id/reports, on a real database.
 * - report_v2 on: each row carries its report type's name -- the one in its snapshot (a later rename never changes it),
 *   else the workspace's name for its tier (a report from before tiers is Basic: the agency's Basic name).
 * - An Enhanced report whose contents aren't written yet is "running_checks".
 * - The contents snapshot (the PDF's render input) is never in the list. report_v2 off: no tierName, as today.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const USER = randomUUID();
const who = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: USER,
    organizationId: who.orgId,
    email: "owner@report-list.example.com.au",
    name: "Owner",
    role: "owner",
    organization: { id: who.orgId, name: "Splice Marketing", region: "au", metadata: {} },
  })),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;
const ids = { old: randomUUID(), named: randomUUID(), running: randomUUID() };

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, {
    brandName: "Hero Home Services",
    agencyName: "Splice Marketing",
    tier: "agency",
    audits: [{ number: 54, completedAt: "2026-11-20T03:00:00.000Z", mentions: { chatgpt: [1] } }],
  });
  who.orgId = fx.orgId;
  await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER}, ${`rl-${USER}`}, ${fx.orgId}, ${`owner-${USER.slice(0, 8)}@report-list.example.com.au`}, 'Owner', 'owner')`;
  await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${fx.orgId}, ${USER}, 'owner', now(), now(), true)`;
  await sql`UPDATE agency_brand_assets SET report_tier_names = ${sql.json({ basic: "Essentials", standard: "Growth Plan", enhanced: "Premium Audit" })}
    WHERE organization_id = ${fx.orgId} AND brand_id IS NULL`;
  const insert = (id: string, tier: string, snapshot: unknown) => sql`
    INSERT INTO generated_reports (id, brand_id, organization_id, audit_id, report_type, period_label, narrative_text,
      headline, report_tier, contents_snapshot)
    VALUES (${id}, ${fx.brandId}, ${fx.orgId}, ${fx.audits[54]}, 'weekly', '2026-W47', 'n', 'h', ${tier},
      ${snapshot === null ? null : sql.json(JSON.parse(JSON.stringify(snapshot)))})`;
  await insert(ids.old, "basic", null);
  // Named "Gold" when it was made: the workspace's names changed since.
  await insert(ids.named, "standard", {
    schema: 1,
    tierName: "Gold",
    reportData: { secret: "render input" },
  });
  await insert(ids.running, "enhanced", null);
}, 60_000);

afterAll(async () => {
  for (const table of ["org_feature_flags", "org_members"])
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM users WHERE id = ${USER}`;
  await fx.cleanup();
  await sql.end();
});

async function list(flag: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId}`;
  if (flag)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'report_v2', true)`;
  const { GET } = await import("@/app/api/brands/[brandId]/reports/route");
  const res = await GET(new Request("http://x"), {
    params: Promise.resolve({ brandId: fx.brandId }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Array<Record<string, unknown>>;
}

describe("the reports list (P17)", () => {
  it("report_v2 on: each row's report type name, the running status, and never the snapshot", async () => {
    const rows = await list(true);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[ids.old].tierName).toBe("Essentials");
    expect(byId[ids.named].tierName).toBe("Gold");
    expect(byId[ids.running].tierName).toBe("Premium Audit");
    expect(byId[ids.running].status).toBe("running_checks");
    expect(byId[ids.named].status).toBe("generating");
    for (const r of rows) {
      expect(r).not.toHaveProperty("contentsSnapshot");
      expect(r).not.toHaveProperty("hasSnapshot");
      expect(r).not.toHaveProperty("snapshotTierName");
    }
    expect(JSON.stringify(rows)).not.toContain("render input");
  });

  it("report_v2 off: no names, as today", async () => {
    const rows = await list(false);
    for (const r of rows) expect(r).not.toHaveProperty("tierName");
  });
});
