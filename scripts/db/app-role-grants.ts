import type postgres from "postgres";

/**
 * Team follow-ups (7 Nov), item 9 -- the app role's privileges on a local database, as production has them.
 *
 * Production got them from prod-fix 0052 (db/prod-fixes/0052-app-role-apply-prod.sql): visibleau_app may
 * SELECT, INSERT, UPDATE and DELETE every table in public and use every sequence, the same applies by default
 * to anything created later, and every table with row-level security has it forced. The dev database got the
 * same from scripts/db/tier1a-app-role.sql. The e2e database never did: visibleau_app could read 2 of its 78
 * tables, so tests that connect as the app role granted themselves what they needed, and could pass or fail
 * for reasons production wouldn't share.
 *
 * scripts/db/migrate-local.ts applies these after every run. tests/integration/global-setup.ts refuses to
 * start while a database's grants differ from them (appRolePrivilegeDrift).
 */
export const APP_ROLE = "visibleau_app";

/** 0052's grants, word for word (tests/unit/db/app-role-grants.test.ts keeps the two the same). */
export const APP_ROLE_GRANTS = [
  "GRANT USAGE ON SCHEMA public TO visibleau_app",
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO visibleau_app",
  "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO visibleau_app",
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO visibleau_app",
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO visibleau_app",
] as const;

/** 0052's last step, word for word: FORCE ROW LEVEL SECURITY on every table that has it enabled. */
export const APP_ROLE_FORCE_RLS = `DO $$ DECLARE tbl text; BEGIN
  FOR tbl IN
    SELECT relname::text FROM pg_class
    WHERE relrowsecurity = true AND relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$`;

const TABLE_PRIVILEGES = ["DELETE", "INSERT", "SELECT", "UPDATE"];
const OTHER_TABLE_PRIVILEGES = ["REFERENCES", "TRIGGER", "TRUNCATE"];
const SEQUENCE_PRIVILEGES = ["SELECT", "USAGE"];
/** aclitem letters for the default privileges above: arwd = INSERT, SELECT, UPDATE, DELETE; rU = SELECT, USAGE. */
const DEFAULT_TABLE_ACL = "arwd";
const DEFAULT_SEQUENCE_ACL = "rU";

type Db = postgres.Sql | postgres.TransactionSql;

/**
 * Grants what 0052 grants, in one transaction. The role itself is made once per Postgres server, with its
 * local password, by scripts/db/tier1a-app-role.sql.
 */
export async function applyAppRoleGrants(sql: postgres.Sql): Promise<void> {
  const [role] = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${APP_ROLE}`;
  if (!role) {
    throw new Error(
      `${APP_ROLE} doesn't exist on this Postgres server. Run scripts/db/tier1a-app-role.sql against it once, then run this again.`,
    );
  }
  await sql.begin(async (tx) => {
    for (const statement of APP_ROLE_GRANTS) await tx.unsafe(statement);
    await tx.unsafe(APP_ROLE_FORCE_RLS);
  });
}

/**
 * Every way the app role's privileges here differ from 0052's, one line each; none when they match. Covers
 * the role's attributes, the schema, each table and sequence in public (exactly the privileges above: none
 * missing, none extra), the default privileges for what the connected role creates next, forced RLS, table
 * ownership, and EXECUTE on public's functions (migration 0107 grants its one function to the app role).
 */
export async function appRolePrivilegeDrift(sql: Db): Promise<string[]> {
  const drift: string[] = [];
  const [role] = await sql<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ${APP_ROLE}
  `;
  if (!role) return [`${APP_ROLE} doesn't exist`];
  if (role.rolsuper) drift.push(`${APP_ROLE} is a superuser`);
  if (role.rolbypassrls) drift.push(`${APP_ROLE} bypasses row-level security`);

  const [schema] = await sql<{ usage: boolean; create: boolean }[]>`
    SELECT has_schema_privilege(${APP_ROLE}, 'public', 'USAGE') AS usage,
           has_schema_privilege(${APP_ROLE}, 'public', 'CREATE') AS create
  `;
  if (!schema?.usage) drift.push("schema public: missing USAGE");
  if (schema?.create) drift.push("schema public: extra CREATE");

  const tables = await sql<
    { name: string; held: string[]; rls: boolean; forced: boolean; owned: boolean }[]
  >`
    SELECT c.relname AS name,
           ARRAY(
             SELECT p FROM unnest(${[...TABLE_PRIVILEGES, ...OTHER_TABLE_PRIVILEGES]}::text[]) AS p
             WHERE has_table_privilege(${APP_ROLE}, c.oid, p)
           ) AS held,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS forced,
           pg_get_userbyid(c.relowner) = ${APP_ROLE} AS owned
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  `;
  for (const t of tables) {
    const missing = TABLE_PRIVILEGES.filter((p) => !t.held.includes(p));
    const extra = t.held.filter((p) => !TABLE_PRIVILEGES.includes(p));
    if (missing.length > 0) drift.push(`table ${t.name}: missing ${missing.join(", ")}`);
    if (extra.length > 0) drift.push(`table ${t.name}: extra ${extra.join(", ")}`);
    if (t.rls && !t.forced) drift.push(`table ${t.name}: row-level security not forced`);
    if (t.owned) drift.push(`table ${t.name}: owned by ${APP_ROLE}`);
  }

  const sequences = await sql<{ name: string; held: string[] }[]>`
    SELECT c.relname AS name,
           ARRAY(
             SELECT p FROM unnest(${[...SEQUENCE_PRIVILEGES, "UPDATE"]}::text[]) AS p
             WHERE has_sequence_privilege(${APP_ROLE}, c.oid, p)
           ) AS held
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
    ORDER BY c.relname
  `;
  for (const s of sequences) {
    const missing = SEQUENCE_PRIVILEGES.filter((p) => !s.held.includes(p));
    const extra = s.held.filter((p) => !SEQUENCE_PRIVILEGES.includes(p));
    if (missing.length > 0) drift.push(`sequence ${s.name}: missing ${missing.join(", ")}`);
    if (extra.length > 0) drift.push(`sequence ${s.name}: extra ${extra.join(", ")}`);
  }

  // What ALTER DEFAULT PRIVILEGES recorded for the role that runs the migrations (the connected one).
  const defaults = await sql<{ objtype: string; acl: string }[]>`
    SELECT d.defaclobjtype AS objtype, a::text AS acl
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL unnest(d.defaclacl) AS a
    WHERE n.nspname = 'public'
      AND d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND a::text LIKE ${`${APP_ROLE}=%`}
  `;
  const defaultFor = (objtype: string) =>
    defaults
      .find((d) => d.objtype === objtype)
      ?.acl.split("=")[1]
      ?.split("/")[0] ?? "";
  if (defaultFor("r") !== DEFAULT_TABLE_ACL)
    drift.push(
      `default privileges on new tables: "${defaultFor("r")}", expected "${DEFAULT_TABLE_ACL}"`,
    );
  if (defaultFor("S") !== DEFAULT_SEQUENCE_ACL)
    drift.push(
      `default privileges on new sequences: "${defaultFor("S")}", expected "${DEFAULT_SEQUENCE_ACL}"`,
    );

  const functions = await sql<{ name: string }[]>`
    SELECT p.proname AS name
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND NOT has_function_privilege(${APP_ROLE}, p.oid, 'EXECUTE')
    ORDER BY p.proname
  `;
  for (const f of functions) drift.push(`function ${f.name}: missing EXECUTE`);

  return drift;
}
