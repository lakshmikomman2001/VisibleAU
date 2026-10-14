import type postgres from "postgres";

/**
 * Task #46 (13th follow-up): the prepush bundle's RLS role row can only
 * ever check `current_user` -- whichever role is running the bundle
 * itself (the Neon SQL editor's project-owner role, never the role
 * Vercel's DATABASE_URL or Inngest's SERVICE_DATABASE_URL actually
 * connect as). The only way to know what the APP's own connections use
 * is to ask them, from inside the app, on their own connection. This is
 * that check.
 */
export interface DbRoleCheckResult {
  role: string;
  super: boolean;
  bypassrls: boolean;
  /** null when this Postgres instance has no `neon_superuser` role at all (e.g. local dev). */
  neonSuperuser: boolean | null;
  rowSecurity: string;
}

export async function checkDbRole(client: postgres.Sql): Promise<DbRoleCheckResult> {
  const [row] = await client<
    { role: string; super: boolean; bypassrls: boolean; neon_superuser: boolean | null; row_security: string }[]
  >`
    SELECT
      current_user AS role,
      r.rolsuper AS super,
      r.rolbypassrls AS bypassrls,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser')
        THEN pg_has_role(current_user, 'neon_superuser', 'member')
        ELSE NULL
      END AS neon_superuser,
      current_setting('row_security') AS row_security
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;

  if (!row) {
    throw new Error("checkDbRole: current_user not found in pg_roles (unexpected)");
  }

  return {
    role: row.role,
    super: row.super,
    bypassrls: row.bypassrls,
    neonSuperuser: row.neon_superuser,
    rowSecurity: row.row_security,
  };
}

export interface DbRoleCheckLogInput {
  /** Which app connection this is -- appears in the log line, not a secret. */
  connection: "app" | "service";
  /** True for a connection that's SUPPOSED to be privileged (the service role bypasses RLS by design). */
  expectedPrivileged: boolean;
}

/**
 * Runs checkDbRole() and logs one structured line -- `info` normally, `error`
 * if the result doesn't match what this connection is supposed to be. Never
 * throws: a DB role check failing is worth knowing about, not worth crashing
 * the app over.
 */
export async function logDbRoleCheck(
  client: postgres.Sql,
  { connection, expectedPrivileged }: DbRoleCheckLogInput,
): Promise<DbRoleCheckResult | null> {
  try {
    const result = await checkDbRole(client);
    const isPrivileged = result.super || result.bypassrls;
    const rowSecurityOff = result.rowSecurity === "off";

    // The "app" connection must be restricted -- privileged here means RLS
    // is silently bypassed for every regular user-facing request. The
    // "service" connection is SUPPOSED to be privileged (background jobs
    // that legitimately cross orgs); the error case there is the opposite --
    // it's missing the privilege it needs.
    const isWrong = expectedPrivileged ? !isPrivileged : isPrivileged || rowSecurityOff;

    const payload = {
      event: "db_role_check",
      connection,
      role: result.role,
      super: result.super,
      bypassrls: result.bypassrls,
      neonSuperuser: result.neonSuperuser,
      rowSecurity: result.rowSecurity,
      expectedPrivileged,
    };

    if (isWrong) {
      console.error(JSON.stringify(payload));
    } else {
      console.log(JSON.stringify(payload));
    }

    return result;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "db_role_check",
        connection,
        error: err instanceof Error ? err.message : "unknown error",
      }),
    );
    return null;
  }
}
