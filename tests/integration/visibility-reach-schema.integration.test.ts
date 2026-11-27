/**
 * S04 part 2 (migration 0157; LLD 7.2, 7A): brand_visibility_scopes and audit_reach_results on the real schema, and
 * prod-fix 0157 run2's backfill run on this test's workspaces only.
 * - Both tables: FORCE RLS with four policies on app.current_org_id; visibleau_app holds each DML privilege (checked one
 *   at a time); as visibleau_app a workspace reads only its own rows.
 * - The backfill: one local reach per brand that isn't deleted, on, its place from the brand's own location, its target
 *   the current set's everyday count (10 with no set); a local result for every complete audit equal to the headline
 *   the app shows (resolveAuditDimensionsAndHeadline: answers, mentions, the Wilson interval as fractions) with the
 *   audit's question hash; a deleted brand and an audit that isn't complete get nothing; a rerun adds nothing.
 * - An audit's results go with the audit; a brand's reaches go with the brand; one row per brand and reach.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { wilsonCI } from "@/lib/scoring/wilson";
import {
  AUDIT_37,
  AUDIT_38,
  EVERYDAY_QUESTIONS,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { sourceText } from "@/tests/helpers/source-files";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

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

async function asOrg<T>(orgId: string, work: (tx: postgres.TransactionSql) => Promise<T>) {
  return (await app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    return work(tx);
  })) as T;
}

let fx: ReportFixture;
let other: ReportFixture;
const NO_SET_BRAND = randomUUID();
const DELETED_BRAND = randomUUID();
const RUNNING_AUDIT = randomUUID();

/** prod-fix 0157 run2's backfill, for this test's workspaces only. */
async function backfill() {
  const run2 = sourceText("db/prod-fixes/0157-s04-run2-apply.sql");
  let section = run2.slice(
    run2.indexOf("-- ==== BACKFILL (begin) ===="),
    run2.indexOf("-- ==== BACKFILL (end) ===="),
  );
  const orgs = `('${fx.orgId}', '${other.orgId}')`;
  for (const [anchor, filter] of [
    ["WHERE b.deleted_at IS NULL\nON CONFLICT", `AND b.organization_id IN ${orgs}`],
    ["WHERE a.status = 'complete'\nON CONFLICT", `AND a.organization_id IN ${orgs}`],
  ] as const) {
    expect(section).toContain(anchor);
    const [where, on] = anchor.split("\n");
    section = section.replace(anchor, `${where} ${filter}\n${on}`);
  }
  // Several statements, so no parameters: the ids are this file's own UUIDs.
  expect(orgs).toMatch(/^\('[0-9a-f-]{36}', '[0-9a-f-]{36}'\)$/);
  await sql.begin((tx) => tx.unsafe(section));
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, { audits: [AUDIT_37, AUDIT_38] });
  other = await seedReportFixture(sql, { audits: [AUDIT_38] });
  // The fixture brand's current set: 7 everyday questions and 1 that names it.
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${fx.orgId}, ${fx.brandId}, 1, true, 's04-reach') RETURNING id`;
  const rows = [
    ...EVERYDAY_QUESTIONS.slice(0, 7).map((text) => ({ text, kind: "everyday" })),
    { text: "Is Yabby Services any good for plumbing?", kind: "branded" },
  ];
  for (const [position, r] of rows.entries()) {
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${fx.orgId}, ${fx.brandId}, ${r.text}, question_text_key(${r.text}), ${r.kind}, 'original') RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${fx.orgId}, ${q.id}, ${position}, ${r.kind}, 'local', 'original')`;
  }
  await sql`UPDATE brands SET city = 'Sydney', postcode = '2154' WHERE id = ${fx.brandId}`;
  for (const [id, deleted] of [
    [NO_SET_BRAND, false],
    [DELETED_BRAND, true],
  ] as const) {
    await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, deleted_at)
      VALUES (${id}, ${fx.orgId}, ${deleted ? "Gone Plumbing" : "Newer Plumbing"}, ${`${id.slice(0, 8)}.example.com.au`},
              'tradies', 'au', ARRAY[]::text[], ${deleted ? sql`now()` : null})`;
  }
  await sql`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, triggered_by)
    VALUES (${RUNNING_AUDIT}, ${fx.brandId}, ${fx.orgId}, 99, 'running', 'manual')`;
  await backfill();
}, 120_000);

afterAll(async () => {
  await sql`DELETE FROM audit_reach_results WHERE organization_id IN (${fx?.orgId ?? null}, ${other?.orgId ?? null})`;
  await sql`DELETE FROM brand_visibility_scopes WHERE organization_id IN (${fx?.orgId ?? null}, ${other?.orgId ?? null})`;
  if (fx) {
    await sql`DELETE FROM audits WHERE id = ${RUNNING_AUDIT}`;
    await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM brand_question_sets WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM brand_questions WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM brands WHERE id IN (${NO_SET_BRAND}, ${DELETED_BRAND})`;
    await fx.cleanup();
  }
  await other?.cleanup();
  await sql.end();
  await app.end();
});

describe("the tables", () => {
  it("FORCE RLS with four policies on app.current_org_id, and each of visibleau_app's DML privileges", async () => {
    for (const table of ["brand_visibility_scopes", "audit_reach_results"]) {
      const [c] = await sql<{ forced: boolean; policies: number; on_org: boolean }[]>`
        SELECT c.relforcerowsecurity AS forced,
          (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policies,
          (SELECT bool_and(coalesce(qual, '') || coalesce(with_check, '') LIKE '%app.current_org_id%')
             FROM pg_policies p WHERE p.tablename = c.relname) AS on_org
        FROM pg_class c WHERE c.relname = ${table}`;
      expect(c, table).toEqual({ forced: true, policies: 4, on_org: true });
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const [g] = await sql<{ ok: boolean }[]>`
          SELECT has_table_privilege('visibleau_app', ${table}, ${priv}) AS ok`;
        expect(g.ok, `${table} ${priv}`).toBe(true);
      }
    }
  });

  it("as visibleau_app a workspace reads only its own rows; no context reads nothing", async () => {
    const mine = await asOrg(fx.orgId, (tx) =>
      tx`SELECT organization_id FROM brand_visibility_scopes`.then((r) => [...r]),
    );
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.organization_id === fx.orgId)).toBe(true);
    const theirs = await asOrg(fx.orgId, (tx) =>
      tx`SELECT 1 FROM audit_reach_results WHERE organization_id = ${other.orgId}`.then((r) => [
        ...r,
      ]),
    );
    expect(theirs).toEqual([]);
    // A fresh connection: one that set the context before keeps it as "" for the session.
    const fresh = postgres(appRoleUrl(), { max: 1 });
    try {
      expect(await fresh`SELECT 1 FROM audit_reach_results`).toHaveLength(0);
      expect(await fresh`SELECT 1 FROM brand_visibility_scopes`).toHaveLength(0);
    } finally {
      await fresh.end();
    }
  });
});

describe("run2's backfill", () => {
  it("one local reach per live brand: on, its own place, the current set's everyday count (10 with no set)", async () => {
    const rows = await sql<
      { brand_id: string; reach: string; enabled: boolean; place: unknown; target_count: number }[]
    >`SELECT brand_id, reach, enabled, place, target_count FROM brand_visibility_scopes
      WHERE organization_id = ${fx.orgId} ORDER BY target_count`;
    expect(rows).toEqual([
      {
        brand_id: fx.brandId,
        reach: "local",
        enabled: true,
        place: { suburb: "Castle Hill", city: "Sydney", state: "NSW", postcode: "2154" },
        target_count: 7,
      },
      { brand_id: NO_SET_BRAND, reach: "local", enabled: true, place: {}, target_count: 10 },
    ]);
  });

  it("a local result for every complete audit, equal to the headline the app shows, with its question hash", async () => {
    const { serviceDb } = await import("@/db/client");
    const { resolveAuditDimensionsAndHeadline } = await import(
      "@/lib/scoring/resolve-audit-dimensions"
    );
    for (const f of [fx, other]) {
      const audits = await sql<{ id: string; hash: string | null; version: number | null }[]>`
        SELECT id, question_set_hash AS hash, prompt_pack_version AS version FROM audits
        WHERE organization_id = ${f.orgId} AND status = 'complete'`;
      expect(audits.length).toBeGreaterThan(0);
      for (const a of audits) {
        const headline = await resolveAuditDimensionsAndHeadline(serviceDb, a.id);
        const [r] = await sql<
          {
            reach: string;
            everyday_answers: number;
            mentioned: number;
            ci_low: string | null;
            ci_high: string | null;
            reach_hash: string;
          }[]
        >`SELECT reach, everyday_answers, mentioned, ci_low, ci_high, reach_hash FROM audit_reach_results
          WHERE audit_id = ${a.id}`;
        const ci = wilsonCI(headline.mentionedCount, headline.sampleCount);
        expect(r).toEqual({
          reach: "local",
          everyday_answers: headline.sampleCount,
          mentioned: headline.mentionedCount,
          ci_low: (ci.lower / 100).toFixed(4),
          ci_high: (ci.upper / 100).toFixed(4),
          reach_hash: a.hash ?? `prompt_pack_version:${a.version ?? 1}`,
        });
      }
    }
    expect(
      await sql`SELECT 1 FROM audit_reach_results WHERE audit_id = ${RUNNING_AUDIT}`,
    ).toHaveLength(0);
    expect(
      await sql`SELECT 1 FROM brand_visibility_scopes WHERE brand_id = ${DELETED_BRAND}`,
    ).toHaveLength(0);
  });

  it("a rerun adds nothing", async () => {
    const count = async () =>
      (
        await sql<{ n: number }[]>`
          SELECT (SELECT count(*) FROM brand_visibility_scopes WHERE organization_id IN (${fx.orgId}, ${other.orgId}))
               + (SELECT count(*) FROM audit_reach_results WHERE organization_id IN (${fx.orgId}, ${other.orgId}))
               AS n`
      )[0].n;
    const before = await count();
    await backfill();
    expect(await count()).toBe(before);
  });
});

describe("deletes and keys", () => {
  it("one row per brand and reach; an audit's delete takes its results; a brand's delete takes its reaches", async () => {
    const dup = await sql
      .begin(
        (tx) => tx`INSERT INTO brand_visibility_scopes (organization_id, brand_id, reach)
          VALUES (${fx.orgId}, ${fx.brandId}, 'local')`,
      )
      .then(
        () => "accepted",
        (e: { code?: string }) => e.code,
      );
    expect(dup).toBe("23505");
    await sql`INSERT INTO audit_reach_results (audit_id, organization_id, reach, everyday_answers, mentioned, reach_hash)
      VALUES (${RUNNING_AUDIT}, ${fx.orgId}, 'state', 4, 1, 'x')`;
    await sql`DELETE FROM audits WHERE id = ${RUNNING_AUDIT}`;
    expect(
      await sql`SELECT 1 FROM audit_reach_results WHERE audit_id = ${RUNNING_AUDIT}`,
    ).toHaveLength(0);
    await sql`DELETE FROM brands WHERE id = ${NO_SET_BRAND}`;
    expect(
      await sql`SELECT 1 FROM brand_visibility_scopes WHERE brand_id = ${NO_SET_BRAND}`,
    ).toHaveLength(0);
    const over = await sql
      .begin(
        (
          tx,
        ) => tx`INSERT INTO audit_reach_results (audit_id, organization_id, reach, everyday_answers, mentioned, reach_hash)
          VALUES (${fx.audits[38]}, ${fx.orgId}, 'country', 3, 4, 'x')`,
      )
      .then(
        () => "accepted",
        (e: { code?: string }) => e.code,
      );
    expect(over).toBe("23514");
  });
});
