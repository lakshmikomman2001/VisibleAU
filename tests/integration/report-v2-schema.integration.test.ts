/**
 * S01 part 2 (migration 0154; LLD 7.5, 7.7, 7A): the report v2 tables and columns on a real database.
 * - report_brand_preferences, report_action_choices, agency_actions: FORCE RLS on app.current_org_id; as visibleau_app
 *   one workspace never reads or writes another's rows, and no context reads nothing;
 * - their CHECKs: tier, note <= 400, title 5-120, detail <= 600, priority, status;
 * - generated_reports.report_tier and report_delivery_schedules.report_tier default 'basic' (today's report, N15),
 *   contents_snapshot NULL; an unknown tier is refused;
 * - agency_brand_assets.report_tier_names: 1-24 characters, no line breaks, unique ignoring case, known keys only,
 *   the workspace row only (brand_id IS NULL);
 * - brands.abn_suggestion is jsonb, NULL by default;
 * - brand deletion: the soft delete (the app's own) leaves every row; a hard delete of the brand takes the three new
 *   tables' rows with it (ON DELETE CASCADE);
 * - audit retention (lib/retention/audit-retention.ts) still deletes an expired audit's open action item when a report
 *   choice points at it: the choice goes with it.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const USER_A = randomUUID();
const BRAND_A = randomUUID();
const BRAND_B = randomUUID();
const BRAND_HARD = randomUUID();
const OLD_AUDIT = randomUUID();
const OLD_ITEM = randomUUID();
const KEPT_ITEM = randomUUID();

const sql = postgres(getTestDatabaseUrl(), { max: 1 });

function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  if (!/^(localhost|127\.0\.0\.1)$/.test(base.hostname))
    throw new Error("local test database only");
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  return base.toString();
}
const app = postgres(appRoleUrl(), { max: 1 });

async function asOrg<T>(
  orgId: string,
  work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return (await app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    return work(tx);
  })) as T;
}

async function refused(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return "accepted";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

beforeAll(async () => {
  for (const [org, slug] of [
    [ORG_A, `report-v2-a-${ORG_A}`],
    [ORG_B, `report-v2-b-${ORG_B}`],
  ] as const) {
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${org}, ${slug}, 'Report v2 Org', ${slug})`;
  }
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER_A}, ${`report-v2-${USER_A}`}, ${ORG_A}, ${`owner-${ORG_A.slice(0, 8)}@report-v2.example.com.au`}, 'Owner', 'owner')
  `;
  for (const [id, org, name] of [
    [BRAND_A, ORG_A, "Hero Home Services"],
    [BRAND_B, ORG_B, "Omega Services"],
    [BRAND_HARD, ORG_A, "Hard Delete Plumbing"],
  ] as const) {
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region)
      VALUES (${id}, ${org}, ${name}, ${`${id.slice(0, 8)}.com.au`}, 'tradies', 'au')
    `;
  }
  // An audit from 2001, so the retention cutoff below (2002) catches it and nothing else in the shared database.
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, created_at)
    VALUES (${OLD_AUDIT}, ${BRAND_A}, ${ORG_A}, 1, 'complete', '2001-03-01T00:00:00Z')
  `;
  for (const [id, status] of [
    [OLD_ITEM, "open"],
    [KEPT_ITEM, "done"],
  ] as const) {
    await sql`
      INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action,
        confidence_label, expected_impact_score, status)
      VALUES (${id}, ${ORG_A}, ${BRAND_A}, ${OLD_AUDIT}, ${`key-${id.slice(0, 8)}`}, 'frequency', 'Link your profiles',
        'Do it.', 'likely', 'medium', ${status})
    `;
  }
}, 30_000);

afterAll(async () => {
  for (const table of ["report_action_choices", "report_brand_preferences", "agency_actions"]) {
    await sql`DELETE FROM ${sql(table)} WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  }
  await sql`DELETE FROM action_items WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM audits WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM generated_reports WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM report_delivery_schedules WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM agency_brand_assets WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM brands WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM users WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM organizations WHERE id IN (${ORG_A}, ${ORG_B})`;
  await sql.end();
  await app.end();
});

describe("0154: the three organisation tables", () => {
  it("have FORCE RLS with four policies each on app.current_org_id", async () => {
    const rows = await sql<{ relname: string; forced: boolean; policies: number }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced,
        (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policies
      FROM pg_class c
      WHERE c.relname IN ('report_brand_preferences', 'report_action_choices', 'agency_actions') AND c.relkind = 'r'
      ORDER BY c.relname
    `;
    expect(rows).toEqual([
      { relname: "agency_actions", forced: true, policies: 4 },
      { relname: "report_action_choices", forced: true, policies: 4 },
      { relname: "report_brand_preferences", forced: true, policies: 4 },
    ]);
  });

  it("as visibleau_app, a workspace reads and writes only its own rows; no context reads nothing", async () => {
    await asOrg(ORG_A, async (tx) => {
      await tx`INSERT INTO report_brand_preferences (brand_id, organization_id, default_tier) VALUES (${BRAND_A}, ${ORG_A}, 'standard')`;
      await tx`INSERT INTO agency_actions (organization_id, brand_id, title, priority) VALUES (${ORG_A}, ${BRAND_A}, 'Ask five clients for reviews', 'high')`;
      await tx`INSERT INTO report_action_choices (organization_id, brand_id, action_item_id, included, position, note)
        VALUES (${ORG_A}, ${BRAND_A}, ${KEPT_ITEM}, true, 1, 'Done in October')`;
    });
    await asOrg(ORG_B, async (tx) => {
      expect(
        await tx`SELECT 1 FROM report_brand_preferences WHERE brand_id = ${BRAND_A}`,
      ).toHaveLength(0);
      expect(await tx`SELECT 1 FROM agency_actions WHERE brand_id = ${BRAND_A}`).toHaveLength(0);
      expect(
        await tx`SELECT 1 FROM report_action_choices WHERE brand_id = ${BRAND_A}`,
      ).toHaveLength(0);
      const updated =
        await tx`UPDATE agency_actions SET title = 'Taken over' WHERE brand_id = ${BRAND_A} RETURNING id`;
      expect(updated).toHaveLength(0);
    });
    expect(
      await refused(() =>
        asOrg(
          ORG_B,
          (tx) =>
            tx`INSERT INTO agency_actions (organization_id, brand_id, title, priority) VALUES (${ORG_A}, ${BRAND_A}, 'Planted by B', 'low')`,
        ),
      ),
    ).toBe("42501");
    // No context on a fresh connection (current_setting is NULL): nothing is read. On a connection that had one
    // set earlier it reads '' and the uuid cast refuses the query -- closed either way.
    const fresh = postgres(appRoleUrl(), { max: 1 });
    try {
      expect(await fresh`SELECT 1 FROM report_brand_preferences`).toHaveLength(0);
      expect(await fresh`SELECT 1 FROM agency_actions`).toHaveLength(0);
      expect(await fresh`SELECT 1 FROM report_action_choices`).toHaveLength(0);
    } finally {
      await fresh.end();
    }
    await asOrg(ORG_A, async (tx) => {
      expect(
        await tx`SELECT default_tier, include_general_advice, include_done_since_last FROM report_brand_preferences WHERE brand_id = ${BRAND_A}`,
      ).toEqual([
        { default_tier: "standard", include_general_advice: true, include_done_since_last: true },
      ]);
      expect(await tx`SELECT status FROM agency_actions WHERE brand_id = ${BRAND_A}`).toEqual([
        { status: "open" },
      ]);
    });
  });

  it("refuse what the LLD's checks refuse", async () => {
    const insertAction =
      (title: string, extra: { detail?: string; priority?: string; status?: string } = {}) =>
      () =>
        sql`INSERT INTO agency_actions (organization_id, brand_id, title, detail, priority, status)
        VALUES (${ORG_A}, ${BRAND_A}, ${title}, ${extra.detail ?? null}, ${extra.priority ?? "low"}, ${extra.status ?? "open"})`;
    expect(await refused(insertAction("Shrt"))).toBe("23514");
    expect(await refused(insertAction("x".repeat(121)))).toBe("23514");
    expect(await refused(insertAction("A fine title", { detail: "x".repeat(601) }))).toBe("23514");
    expect(await refused(insertAction("A fine title", { priority: "urgent" }))).toBe("23514");
    expect(await refused(insertAction("A fine title", { status: "archived" }))).toBe("23514");
    expect(
      await refused(
        () =>
          sql`INSERT INTO report_brand_preferences (brand_id, organization_id, default_tier) VALUES (${BRAND_HARD}, ${ORG_A}, 'platinum')`,
      ),
    ).toBe("23514");
    expect(
      await refused(
        () => sql`INSERT INTO report_action_choices (organization_id, brand_id, action_item_id, note)
          VALUES (${ORG_A}, ${BRAND_A}, ${OLD_ITEM}, ${"x".repeat(401)})`,
      ),
    ).toBe("23514");
    expect(
      await refused(
        () =>
          sql`INSERT INTO report_action_choices (organization_id, brand_id, action_item_id) VALUES (${ORG_A}, ${BRAND_A}, ${KEPT_ITEM})`,
      ),
    ).toBe("23505");
  });
});

describe("0154: the new columns", () => {
  it("a report and a schedule without a tier are 'basic', with no snapshot; an unknown tier is refused", async () => {
    const [report] = await sql<{ report_tier: string; contents_snapshot: unknown }[]>`
      INSERT INTO generated_reports (brand_id, organization_id, report_type, narrative_text, headline)
      VALUES (${BRAND_A}, ${ORG_A}, 'weekly', 'Narrative', 'Headline')
      RETURNING report_tier, contents_snapshot
    `;
    expect(report).toEqual({ report_tier: "basic", contents_snapshot: null });
    const [schedule] = await sql<{ report_tier: string }[]>`
      INSERT INTO report_delivery_schedules (organization_id, brand_id, frequency, recipient_emails)
      VALUES (${ORG_A}, ${BRAND_A}, 'weekly', ${sql.json(["owner@report-v2.example.com.au"])})
      RETURNING report_tier
    `;
    expect(schedule.report_tier).toBe("basic");
    expect(
      await refused(
        () =>
          sql`UPDATE generated_reports SET report_tier = 'platinum' WHERE organization_id = ${ORG_A}`,
      ),
    ).toBe("23514");
    expect(
      await refused(
        () =>
          sql`UPDATE report_delivery_schedules SET report_tier = 'premium' WHERE organization_id = ${ORG_A}`,
      ),
    ).toBe("23514");
  });

  it("tier names: 1-24 characters, no line breaks, unique ignoring case, known keys, workspace row only", async () => {
    const [row] = await sql<{ id: string; report_tier_names: unknown }[]>`
      INSERT INTO agency_brand_assets (organization_id, brand_id) VALUES (${ORG_A}, NULL) RETURNING id, report_tier_names
    `;
    expect(row.report_tier_names).toBeNull();
    const names = {
      basic: "Essentials",
      standard: "Growth Plan",
      enhanced: "Premium Audit",
    };
    await sql`UPDATE agency_brand_assets SET report_tier_names = ${sql.json(names)} WHERE id = ${row.id}`;
    const set = (value: unknown) => () =>
      sql`UPDATE agency_brand_assets SET report_tier_names = ${sql.json(value as postgres.JSONValue)} WHERE id = ${row.id}`;
    expect(await refused(set({ basic: "Essentials", standard: "ESSENTIALS" }))).toBe("23514");
    expect(await refused(set({ basic: "   " }))).toBe("23514");
    expect(await refused(set({ basic: "x".repeat(25) }))).toBe("23514");
    expect(await refused(set({ basic: "Two\nlines" }))).toBe("23514");
    expect(await refused(set({ premium: "Premium" }))).toBe("23514");
    expect(await refused(set({ basic: 5 }))).toBe("23514");
    expect(await refused(set(["Essentials"]))).toBe("23514");
    expect(await refused(set({ enhanced: "  Premium Audit  " }))).toBe("accepted");
    const [brandRow] = await sql<{ id: string }[]>`
      INSERT INTO agency_brand_assets (organization_id, brand_id) VALUES (${ORG_A}, ${BRAND_A}) RETURNING id
    `;
    expect(
      await refused(
        () =>
          sql`UPDATE agency_brand_assets SET report_tier_names = ${sql.json(names)} WHERE id = ${brandRow.id}`,
      ),
    ).toBe("23514");
  });

  it("brands.abn_suggestion is jsonb and NULL for every brand until a suggestion is made", async () => {
    const [b] = await sql<{ abn_suggestion: unknown; type: string }[]>`
      SELECT abn_suggestion, pg_typeof(abn_suggestion)::text AS type FROM brands WHERE id = ${BRAND_A}
    `;
    expect(b).toEqual({ abn_suggestion: null, type: "jsonb" });
  });
});

describe("0154: deletion and retention", () => {
  it("the app's brand delete (soft) leaves every row; a hard delete takes the new tables' rows with it", async () => {
    await sql`INSERT INTO report_brand_preferences (brand_id, organization_id) VALUES (${BRAND_HARD}, ${ORG_A})`;
    await sql`INSERT INTO agency_actions (organization_id, brand_id, title, priority) VALUES (${ORG_A}, ${BRAND_HARD}, 'Claim the Yelp page', 'medium')`;
    await sql`UPDATE brands SET deleted_at = now() WHERE id = ${BRAND_HARD}`;
    const count = async () =>
      (
        await sql<{ c: number }[]>`
          SELECT ((SELECT count(*) FROM report_brand_preferences WHERE brand_id = ${BRAND_HARD})
            + (SELECT count(*) FROM agency_actions WHERE brand_id = ${BRAND_HARD}))::int AS c`
      )[0].c;
    expect(await count()).toBe(2);
    await sql`DELETE FROM brands WHERE id = ${BRAND_HARD}`;
    expect(await count()).toBe(0);
  });

  it("retention deletes an expired audit's open action item that a report choice points at, and the choice with it", async () => {
    await sql`INSERT INTO report_action_choices (organization_id, brand_id, action_item_id, included, position)
      VALUES (${ORG_A}, ${BRAND_A}, ${OLD_ITEM}, true, 2)`;
    process.env.DATABASE_URL = getTestDatabaseUrl();
    const { db } = await import("@/db/client");
    const { deleteExpiredAudits } = await import("@/lib/retention/audit-retention");
    const result = await deleteExpiredAudits(db, new Date("2002-01-01T00:00:00Z"));
    expect(result.deletedAudits).toBeGreaterThanOrEqual(1);
    expect(await sql`SELECT 1 FROM audits WHERE id = ${OLD_AUDIT}`).toHaveLength(0);
    expect(await sql`SELECT 1 FROM action_items WHERE id = ${OLD_ITEM}`).toHaveLength(0);
    expect(
      await sql`SELECT 1 FROM report_action_choices WHERE action_item_id = ${OLD_ITEM}`,
    ).toHaveLength(0);
    // The done item is kept (its audit reference cleared), with its report choice.
    expect(await sql`SELECT audit_id FROM action_items WHERE id = ${KEPT_ITEM}`).toEqual([
      { audit_id: null },
    ]);
    expect(
      await sql`SELECT 1 FROM report_action_choices WHERE action_item_id = ${KEPT_ITEM}`,
    ).toHaveLength(1);
  });
});
