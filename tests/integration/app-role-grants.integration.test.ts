/**
 * Team follow-ups (7 Nov), item 9: the e2e database's app role has exactly production's grants (prod-fix
 * 0052), as `pnpm db:migrate:local` applies them -- and the check that tests/integration/global-setup.ts runs
 * before every integration run does notice a difference. The changes below are made inside a transaction
 * that's always rolled back.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_ROLE, appRolePrivilegeDrift } from "@/scripts/db/app-role-grants";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let su: ReturnType<typeof postgres>;

beforeAll(() => {
  su = postgres(getTestDatabaseUrl(), { max: 1 });
});

afterAll(async () => {
  await su.end();
});

class RolledBack extends Error {}

/** fn's result, from inside a transaction that's then rolled back. */
async function thenRollBack<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await su
    .begin(async (tx) => {
      result = await fn(tx);
      throw new RolledBack();
    })
    .catch((e) => {
      if (!(e instanceof RolledBack)) throw e;
    });
  return result as T;
}

describe("visibleau_app's privileges on the e2e database", () => {
  it("are production's: DML on every table, nothing more, RLS forced", async () => {
    expect(await appRolePrivilegeDrift(su)).toEqual([]);

    const [counts] = await su<{ tables: number; with_dml: number }[]>`
      SELECT count(*)::int AS tables,
             count(*) FILTER (
               WHERE has_table_privilege(${APP_ROLE}, c.oid, 'SELECT')
                 AND has_table_privilege(${APP_ROLE}, c.oid, 'INSERT')
                 AND has_table_privilege(${APP_ROLE}, c.oid, 'UPDATE')
                 AND has_table_privilege(${APP_ROLE}, c.oid, 'DELETE')
             )::int AS with_dml
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    `;
    expect(counts.tables).toBeGreaterThan(70);
    expect(counts.with_dml).toBe(counts.tables);
  });

  it("a privilege taken away, one added, or RLS no longer forced is reported", async () => {
    const drift = await thenRollBack(async (tx) => {
      await tx.unsafe(`REVOKE INSERT, DELETE ON brands FROM ${APP_ROLE}`);
      await tx.unsafe(`GRANT TRUNCATE ON audits TO ${APP_ROLE}`);
      await tx.unsafe("ALTER TABLE citations NO FORCE ROW LEVEL SECURITY");
      return appRolePrivilegeDrift(tx);
    });
    expect(drift).toEqual([
      "table audits: extra TRUNCATE",
      "table brands: missing DELETE, INSERT",
      "table citations: row-level security not forced",
    ]);
    // Rolled back: nothing changed.
    expect(await appRolePrivilegeDrift(su)).toEqual([]);
  });

  it("a revoked default for new tables is reported", async () => {
    const drift = await thenRollBack(async (tx) => {
      await tx.unsafe(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM ${APP_ROLE}`,
      );
      return appRolePrivilegeDrift(tx);
    });
    expect(drift).toEqual(['default privileges on new tables: "arw", expected "arwd"']);
  });
});
