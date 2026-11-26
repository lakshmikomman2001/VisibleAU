/**
 * S03 part 1 (migration 0156; LLD 7.6, 7A, N7): question packs on a real database.
 * - organizations.question_packs: an integer, 0 on every row unless set, never below 0;
 * - brand_question_packs: FORCE RLS with four policies on app.current_org_id; as visibleau_app a workspace reads and
 *   writes only its own rows, and no context reads nothing; packs never below 0; one row per brand; a brand's delete
 *   takes its row.
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

/** The SQLSTATE a statement fails with ("23514" a CHECK, "23505" unique, "42501" RLS), or "accepted". */
async function refused(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return "accepted";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

beforeAll(async () => {
  for (const org of [ORG_A, ORG_B]) {
    const slug = `question-packs-${org}`;
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${org}, ${slug}, 'Question Packs Org', ${slug})`;
  }
  for (const [id, org] of [
    [BRAND_A, ORG_A],
    [BRAND_B, ORG_B],
  ] as const) {
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region)
      VALUES (${id}, ${org}, 'Galah Plumbing', ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au')`;
  }
}, 30_000);

afterAll(async () => {
  const orgs = [ORG_A, ORG_B];
  await sql`DELETE FROM brand_question_packs WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brands WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
  await app.end();
});

describe("0156: organizations.question_packs", () => {
  it("is 0 for a workspace made without it, an integer, never below 0", async () => {
    const [row] = await sql<{ question_packs: number }[]>`
      SELECT question_packs FROM organizations WHERE id = ${ORG_A}`;
    expect(row.question_packs).toBe(0);
    expect(
      await refused(() => sql`UPDATE organizations SET question_packs = -1 WHERE id = ${ORG_A}`),
    ).toBe("23514");
    await sql`UPDATE organizations SET question_packs = 3 WHERE id = ${ORG_A}`;
    expect(
      (await sql`SELECT question_packs FROM organizations WHERE id = ${ORG_A}`)[0].question_packs,
    ).toBe(3);
    await sql`UPDATE organizations SET question_packs = 0 WHERE id = ${ORG_A}`;
  });
});

describe("0156: brand_question_packs", () => {
  it("has FORCE RLS with four policies on app.current_org_id, and visibleau_app's DML", async () => {
    const [table] = await sql<{ rls: boolean; forced: boolean }[]>`
      SELECT relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class
      WHERE oid = 'public.brand_question_packs'::regclass`;
    expect(table).toEqual({ rls: true, forced: true });
    const policies = await sql<{ cmd: string; uses_org: boolean }[]>`
      SELECT cmd, (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%app.current_org_id%' AS uses_org
      FROM pg_policies WHERE tablename = 'brand_question_packs' ORDER BY cmd`;
    expect(policies.map((p) => p.cmd)).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    expect(policies.every((p) => p.uses_org)).toBe(true);
    const [grant] = await sql<{ dml: boolean }[]>`
      SELECT has_table_privilege('visibleau_app', 'brand_question_packs', 'SELECT,INSERT,UPDATE,DELETE') AS dml`;
    expect(grant.dml).toBe(true);
  });

  it("as visibleau_app, a workspace reads and writes only its own rows; no context reads nothing", async () => {
    await asOrg(
      ORG_A,
      (tx) => tx`INSERT INTO brand_question_packs (brand_id, organization_id, packs)
      VALUES (${BRAND_A}, ${ORG_A}, 2)`,
    );
    await asOrg(ORG_B, async (tx) => {
      expect(await tx`SELECT 1 FROM brand_question_packs WHERE brand_id = ${BRAND_A}`).toHaveLength(
        0,
      );
      expect(
        await tx`UPDATE brand_question_packs SET packs = 9 WHERE brand_id = ${BRAND_A} RETURNING brand_id`,
      ).toHaveLength(0);
    });
    expect(
      await refused(() =>
        asOrg(
          ORG_B,
          (tx) => tx`INSERT INTO brand_question_packs (brand_id, organization_id, packs)
            VALUES (${BRAND_B}, ${ORG_A}, 1)`,
        ),
      ),
    ).toBe("42501");
    const fresh = postgres(appRoleUrl(), { max: 1 });
    try {
      expect(await fresh`SELECT 1 FROM brand_question_packs`).toHaveLength(0);
    } finally {
      await fresh.end();
    }
    await asOrg(ORG_A, async (tx) => {
      expect(await tx`SELECT packs FROM brand_question_packs WHERE brand_id = ${BRAND_A}`).toEqual([
        { packs: 2 },
      ]);
    });
  });

  it("packs never below 0, one row per brand, and a brand's delete takes its row", async () => {
    expect(
      await refused(
        () => sql`INSERT INTO brand_question_packs (brand_id, organization_id, packs)
          VALUES (${BRAND_B}, ${ORG_B}, -1)`,
      ),
    ).toBe("23514");
    await sql`INSERT INTO brand_question_packs (brand_id, organization_id, packs) VALUES (${BRAND_B}, ${ORG_B}, 1)`;
    expect(
      await refused(
        () => sql`INSERT INTO brand_question_packs (brand_id, organization_id, packs)
          VALUES (${BRAND_B}, ${ORG_B}, 1)`,
      ),
    ).toBe("23505");
    await sql`DELETE FROM brands WHERE id = ${BRAND_B}`;
    expect(await sql`SELECT 1 FROM brand_question_packs WHERE brand_id = ${BRAND_B}`).toHaveLength(
      0,
    );
  });
});
