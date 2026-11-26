/**
 * S02 part 1 (migration 0155; LLD 7.1, 7A, N7): the question library tables and columns on a real database.
 * - brand_questions, brand_question_sets, brand_question_set_items: FORCE RLS on app.current_org_id; as visibleau_app
 *   one workspace never reads or writes another's rows, and no context reads nothing;
 * - their CHECKs: text 10-200, text_key = question_text_key(text), kind, source, reach, status, intent; one live
 *   question per brand and compared text (an archived one doesn't count); one current set per brand; one item per
 *   position;
 * - audits.question_set_id, citations.question_id, engine_call_failures.question_id: NULL by default;
 * - deletion: a question a set uses can't be deleted on its own (NO ACTION), yet a brand's hard delete takes its
 *   questions, sets and items in one statement; deleting a set clears audits.question_set_id (SET NULL);
 * - audit retention (lib/retention/audit-retention.ts) deletes an expired audit whose answers point at a question;
 *   the question stays.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const BRAND_A = randomUUID();
const BRAND_B = randomUUID();
const BRAND_HARD = randomUUID();
const OLD_AUDIT = randomUUID();

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

/** The SQLSTATE a statement fails with ("23514" a CHECK, "23505" unique, "23503" a reference, "42501" RLS). */
async function refused(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return "accepted";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

async function question(
  brandId: string,
  orgId: string,
  text: string,
  over: Partial<Record<"kind" | "source" | "reach" | "status", string>> = {},
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source, reach, status)
    VALUES (${orgId}, ${brandId}, ${text}, question_text_key(${text}), ${over.kind ?? "everyday"},
            ${over.source ?? "original"}, ${over.reach ?? "local"}, ${over.status ?? "ready"})
    RETURNING id`;
  return row.id;
}

async function set(
  brandId: string,
  orgId: string,
  version: number,
  current: boolean,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${orgId}, ${brandId}, ${version}, ${current}, ${`hash-${version}`})
    RETURNING id`;
  return row.id;
}

async function item(setId: string, orgId: string, questionId: string, position: number) {
  await sql`
    INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
    VALUES (${setId}, ${orgId}, ${questionId}, ${position}, 'everyday', 'local', 'original')`;
}

beforeAll(async () => {
  for (const [org, slug] of [
    [ORG_A, `question-library-a-${ORG_A}`],
    [ORG_B, `question-library-b-${ORG_B}`],
  ] as const) {
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${org}, ${slug}, 'Question Library Org', ${slug})`;
  }
  for (const [id, org, name] of [
    [BRAND_A, ORG_A, "Wren Home Services"],
    [BRAND_B, ORG_B, "Yabby Services"],
    [BRAND_HARD, ORG_A, "Galah Plumbing"],
  ] as const) {
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region)
      VALUES (${id}, ${org}, ${name}, ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au')`;
  }
  // An audit from 2001, so the retention cutoff below (2002) catches it and nothing else in the shared database.
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, created_at)
    VALUES (${OLD_AUDIT}, ${BRAND_A}, ${ORG_A}, 1, 'complete', '2001-03-01T00:00:00Z')`;
}, 30_000);

afterAll(async () => {
  const orgs = [ORG_A, ORG_B];
  await sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ANY(${orgs}))`;
  await sql`DELETE FROM engine_call_failures WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM audits WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brands WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
  await app.end();
});

describe("0155: the three organisation tables", () => {
  it("have FORCE RLS with four policies each on app.current_org_id, and visibleau_app's DML", async () => {
    const rows = await sql<{ relname: string; forced: boolean; policies: number; dml: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced,
        (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname
           AND coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%app.current_org_id%') AS policies,
        has_table_privilege('visibleau_app', c.relname::text, 'SELECT,INSERT,UPDATE,DELETE') AS dml
      FROM pg_class c
      WHERE c.relname IN ('brand_questions', 'brand_question_sets', 'brand_question_set_items') AND c.relkind = 'r'
      ORDER BY c.relname`;
    expect(rows).toEqual([
      { relname: "brand_question_set_items", forced: true, policies: 4, dml: true },
      { relname: "brand_question_sets", forced: true, policies: 4, dml: true },
      { relname: "brand_questions", forced: true, policies: 4, dml: true },
    ]);
  });

  it("as visibleau_app, a workspace reads and writes only its own rows; no context reads nothing", async () => {
    const setId = randomUUID();
    await asOrg(ORG_A, async (tx) => {
      const [q] = await tx<{ id: string }[]>`
        INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
        VALUES (${ORG_A}, ${BRAND_A}, 'Who is the best plumber in Chatswood?',
                question_text_key('Who is the best plumber in Chatswood?'), 'everyday', 'original')
        RETURNING id`;
      await tx`INSERT INTO brand_question_sets (id, organization_id, brand_id, version, is_current, comparison_hash)
        VALUES (${setId}, ${ORG_A}, ${BRAND_A}, 1, true, 'h')`;
      await tx`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
        VALUES (${setId}, ${ORG_A}, ${q.id}, 0, 'everyday', 'local', 'original')`;
    });
    await asOrg(ORG_B, async (tx) => {
      expect(await tx`SELECT 1 FROM brand_questions WHERE brand_id = ${BRAND_A}`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM brand_question_sets WHERE brand_id = ${BRAND_A}`).toHaveLength(
        0,
      );
      expect(await tx`SELECT 1 FROM brand_question_set_items WHERE set_id = ${setId}`).toHaveLength(
        0,
      );
      expect(
        await tx`UPDATE brand_question_sets SET is_current = false WHERE brand_id = ${BRAND_A} RETURNING id`,
      ).toHaveLength(0);
    });
    expect(
      await refused(() =>
        asOrg(
          ORG_B,
          (tx) =>
            tx`INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
              VALUES (${ORG_A}, ${BRAND_A}, 'Planted by another workspace', question_text_key('Planted by another workspace'), 'everyday', 'agency')`,
        ),
      ),
    ).toBe("42501");
    const fresh = postgres(appRoleUrl(), { max: 1 });
    try {
      expect(await fresh`SELECT 1 FROM brand_questions`).toHaveLength(0);
      expect(await fresh`SELECT 1 FROM brand_question_sets`).toHaveLength(0);
      expect(await fresh`SELECT 1 FROM brand_question_set_items`).toHaveLength(0);
    } finally {
      await fresh.end();
    }
    await asOrg(ORG_A, async (tx) => {
      expect(
        await tx`SELECT version, is_current FROM brand_question_sets WHERE id = ${setId}`,
      ).toEqual([{ version: 1, is_current: true }]);
    });
  });

  it("refuse what the LLD's checks refuse", async () => {
    const insert = (over: Record<string, string>) =>
      sql`INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source, reach, status, intent)
        VALUES (${ORG_B}, ${BRAND_B}, ${over.text ?? "Which plumber should I call in Lidcombe?"},
                ${over.textKey ?? sql`question_text_key(${over.text ?? "Which plumber should I call in Lidcombe?"})`},
                ${over.kind ?? "everyday"}, ${over.source ?? "original"}, ${over.reach ?? "local"},
                ${over.status ?? "ready"}, ${over.intent ?? null})`;
    expect(await refused(() => insert({ text: "Too short" }))).toBe("23514");
    expect(await refused(() => insert({ text: `A question ${"x".repeat(200)}` }))).toBe("23514");
    expect(await refused(() => insert({ textKey: "not its compared text" }))).toBe("23514");
    expect(await refused(() => insert({ kind: "named" }))).toBe("23514");
    expect(await refused(() => insert({ source: "guess" }))).toBe("23514");
    expect(await refused(() => insert({ reach: "galaxy" }))).toBe("23514");
    expect(await refused(() => insert({ status: "draft" }))).toBe("23514");
    expect(await refused(() => insert({ intent: "nearby" }))).toBe("23514");
  });

  it("one live question per brand and compared text; an archived one doesn't count", async () => {
    const first = await question(BRAND_B, ORG_B, "Who fixes leaking taps in Lidcombe?");
    expect(
      await refused(() => question(BRAND_B, ORG_B, "who fixes leaking taps — in Lidcombe")),
    ).toBe("23505");
    await sql`UPDATE brand_questions SET archived_at = now(), status = 'archived' WHERE id = ${first}`;
    expect(await question(BRAND_B, ORG_B, "Who fixes leaking taps in Lidcombe?")).toMatch(/-/);
  });

  it("one current set per brand, unique versions, one item per position", async () => {
    const s1 = await set(BRAND_B, ORG_B, 1, true);
    expect(await refused(() => set(BRAND_B, ORG_B, 2, true))).toBe("23505");
    expect(await refused(() => set(BRAND_B, ORG_B, 1, false))).toBe("23505");
    const q1 = await question(BRAND_B, ORG_B, "Best roof plumber near Auburn?");
    const q2 = await question(BRAND_B, ORG_B, "Emergency plumber open now in Berala?");
    await item(s1, ORG_B, q1, 0);
    expect(await refused(() => item(s1, ORG_B, q2, 0))).toBe("23505");
    expect(await refused(() => item(s1, ORG_B, q1, 1))).toBe("23505");
  });
});

describe("0155: the new columns", () => {
  it("audits.question_set_id, citations.question_id and engine_call_failures.question_id are nullable uuids, NULL by default", async () => {
    const cols = await sql<
      { table_name: string; column_name: string; data_type: string; is_nullable: string }[]
    >`
      SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
      WHERE (table_name, column_name) IN (('audits', 'question_set_id'), ('citations', 'question_id'),
                                          ('engine_call_failures', 'question_id'))
      ORDER BY table_name`;
    expect(cols).toEqual([
      {
        table_name: "audits",
        column_name: "question_set_id",
        data_type: "uuid",
        is_nullable: "YES",
      },
      {
        table_name: "citations",
        column_name: "question_id",
        data_type: "uuid",
        is_nullable: "YES",
      },
      {
        table_name: "engine_call_failures",
        column_name: "question_id",
        data_type: "uuid",
        is_nullable: "YES",
      },
    ]);
    expect(await sql`SELECT question_set_id FROM audits WHERE id = ${OLD_AUDIT}`).toEqual([
      { question_set_id: null },
    ]);
  });
});

describe("0155: deletion and retention", () => {
  it("a question a set uses can't be deleted on its own; deleting the set clears its audits' reference", async () => {
    const q = await question(BRAND_A, ORG_A, "Which plumber in Chatswood has the best reviews?");
    const s = await set(BRAND_A, ORG_A, 7, false);
    await item(s, ORG_A, q, 0);
    expect(await refused(() => sql`DELETE FROM brand_questions WHERE id = ${q}`)).toBe("23503");
    const audit = randomUUID();
    await sql`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, question_set_id)
      VALUES (${audit}, ${BRAND_A}, ${ORG_A}, 2, 'complete', ${s})`;
    await sql`DELETE FROM brand_question_sets WHERE id = ${s}`;
    expect(await sql`SELECT question_set_id FROM audits WHERE id = ${audit}`).toEqual([
      { question_set_id: null },
    ]);
    expect(await sql`SELECT 1 FROM brand_question_set_items WHERE set_id = ${s}`).toHaveLength(0);
  });

  it("the app's brand delete (soft) leaves every row; a hard delete takes questions, sets and items in one statement", async () => {
    const q1 = await question(BRAND_HARD, ORG_A, "Who can unblock a drain in Bondi Junction?");
    const q2 = await question(BRAND_HARD, ORG_A, "Is Galah Plumbing reputable?", {
      kind: "branded",
    });
    const s = await set(BRAND_HARD, ORG_A, 1, true);
    await item(s, ORG_A, q1, 0);
    await item(s, ORG_A, q2, 1);
    await sql`UPDATE brands SET deleted_at = now() WHERE id = ${BRAND_HARD}`;
    const count = async () =>
      (
        await sql<{ c: number }[]>`
          SELECT ((SELECT count(*) FROM brand_questions WHERE brand_id = ${BRAND_HARD})
            + (SELECT count(*) FROM brand_question_sets WHERE brand_id = ${BRAND_HARD})
            + (SELECT count(*) FROM brand_question_set_items WHERE set_id = ${s}))::int AS c`
      )[0].c;
    expect(await count()).toBe(5);
    await sql`DELETE FROM brands WHERE id = ${BRAND_HARD}`;
    expect(await count()).toBe(0);
  });

  it("retention deletes an expired audit whose answers and failures point at a question; the question stays", async () => {
    const q = await question(BRAND_A, ORG_A, "Recommend a hot water installer near Willoughby");
    await sql`INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, question_id)
      VALUES (${OLD_AUDIT}, 'chatgpt', 'Recommend a hot water installer near Willoughby', 0, 1, false, false, ${q})`;
    await sql`INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, error_class,
                                                attempts, latency_ms, is_branded_prompt, question_id)
      VALUES (${OLD_AUDIT}, ${ORG_A}, 'claude', 'Recommend a hot water installer near Willoughby', 0, 'other', 1, 10,
              false, ${q})`;
    process.env.DATABASE_URL = getTestDatabaseUrl();
    const { db } = await import("@/db/client");
    const { deleteExpiredAudits } = await import("@/lib/retention/audit-retention");
    const result = await deleteExpiredAudits(db, new Date("2002-01-01T00:00:00Z"));
    expect(result.deletedAudits).toBeGreaterThanOrEqual(1);
    expect(await sql`SELECT 1 FROM audits WHERE id = ${OLD_AUDIT}`).toHaveLength(0);
    expect(await sql`SELECT 1 FROM citations WHERE audit_id = ${OLD_AUDIT}`).toHaveLength(0);
    expect(
      await sql`SELECT 1 FROM engine_call_failures WHERE audit_id = ${OLD_AUDIT}`,
    ).toHaveLength(0);
    expect(await sql`SELECT 1 FROM brand_questions WHERE id = ${q}`).toHaveLength(1);
  });
});
