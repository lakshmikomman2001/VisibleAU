/**
 * B1 (Sri, 31 Oct) -- an admin invited from another org gets the org's
 * notification emails. Their users row lives in their home org, so the
 * app role's RLS context for the inviting org hides it; recipients come
 * through app_notification_recipients() (migration 0107), a SECURITY
 * DEFINER function that returns only (user_id, email) of the context
 * org's accepted, active owner/admin members.
 *
 * The app's own connection runs as visibleau_app (NOSUPERUSER,
 * NOBYPASSRLS), not the test superuser -- a superuser bypasses RLS, so
 * the cross-org case would pass with or without the function.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { resendSend } = vi.hoisted(() => ({ resendSend: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const ORG = {
  inviting: randomUUID(),
  home: randomUUID(),
  other: randomUUID(),
  closed: randomUUID(),
};
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const DOMAIN = "cross-org-test.example.com.au";
const OWNER = `owner@${DOMAIN}`;
const INVITED_ADMIN = `invited-admin@${DOMAIN}`;
const INVITED_ANALYST = `invited-analyst@${DOMAIN}`;
const INVITED_VIEWER = `invited-viewer@${DOMAIN}`;
const PENDING_ADMIN = `pending-admin@${DOMAIN}`;
const REMOVED_ADMIN = `removed-admin@${DOMAIN}`;
const OTHER_ORG_ADMIN = `other-org-admin@${DOMAIN}`;
const CLOSED_ORG_ADMIN = `closed-org-admin@${DOMAIN}`;
const ids: Record<string, string> = {};

const FUNCTION = "app_notification_recipients";
const READER = "visibleau_notification_reader";

let su: ReturnType<typeof postgres>;

// scripts/db/tier1a-app-role.sql's local role -- never sent anywhere
// outside localhost.
function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

async function addOrg(id: string, name: string, closed = false) {
  await su`
    INSERT INTO organizations (id, clerk_org_id, name, slug, deleted_at)
    VALUES (${id}, ${`cross-org-${id}`}, ${name}, ${`cross-org-${id}`}, ${closed ? new Date() : null})
  `;
}

/** A profile whose own account lives in `homeOrg`. */
async function addProfile(key: string, email: string, homeOrg: string, role: string) {
  const id = randomUUID();
  ids[key] = id;
  await su`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${id}, ${`cross-org-${id}`}, ${homeOrg}, ${email}, 'Test', ${role})
  `;
}

async function addMember(
  org: string,
  key: string,
  role: string,
  state: { accepted: boolean; active: boolean },
) {
  await su`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${org}, ${ids[key]}, ${role}, now() + interval '7 days',
      ${state.accepted ? new Date() : null}, ${state.active})
  `;
}

const ACCEPTED = { accepted: true, active: true };

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  su = postgres(url, { max: 1 });
  // The app's own connection (@/db/client's `db`) is the RLS-enforced role;
  // background loads (serviceDb) stay on the service connection.
  process.env.DATABASE_URL = appRoleUrl();
  process.env.SERVICE_DATABASE_URL = url;
  // Production's prod-fix 0052 grants visibleau_app DML on every table; the
  // e2e database never got those grants. The resolver reads these four.
  await su`GRANT SELECT ON organizations, notification_preferences, users, org_members TO visibleau_app`;

  await addOrg(ORG.inviting, "Inviting Org");
  await addOrg(ORG.home, "Home Org");
  await addOrg(ORG.other, "Other Org");
  await addOrg(ORG.closed, "Closed Org", true);

  // The inviting org's own owner: profile and membership here.
  await addProfile("owner", OWNER, ORG.inviting, "owner");
  await addMember(ORG.inviting, "owner", "owner", ACCEPTED);
  // Invited from another org: their profiles stay in their home org.
  await addProfile("invitedAdmin", INVITED_ADMIN, ORG.home, "owner");
  await addMember(ORG.inviting, "invitedAdmin", "admin", ACCEPTED);
  await addProfile("invitedAnalyst", INVITED_ANALYST, ORG.home, "member");
  await addMember(ORG.inviting, "invitedAnalyst", "analyst", ACCEPTED);
  await addProfile("invitedViewer", INVITED_VIEWER, ORG.home, "member");
  await addMember(ORG.inviting, "invitedViewer", "viewer", ACCEPTED);
  await addProfile("pendingAdmin", PENDING_ADMIN, ORG.home, "member");
  await addMember(ORG.inviting, "pendingAdmin", "admin", { accepted: false, active: false });
  await addProfile("removedAdmin", REMOVED_ADMIN, ORG.home, "member");
  await addMember(ORG.inviting, "removedAdmin", "admin", { accepted: true, active: false });
  await addProfile("placeholder", "pending@sync.local", ORG.home, "member");
  await addMember(ORG.inviting, "placeholder", "admin", ACCEPTED);
  // A different org's admin, never a member of the inviting org.
  await addProfile("otherOrgAdmin", OTHER_ORG_ADMIN, ORG.other, "owner");
  await addMember(ORG.other, "otherOrgAdmin", "admin", ACCEPTED);
  // A closed org's admin.
  await addProfile("closedOrgAdmin", CLOSED_ORG_ADMIN, ORG.home, "member");
  await addMember(ORG.closed, "closedOrgAdmin", "admin", ACCEPTED);

  await su`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG.inviting}, 'Cross Org Co', 'cross-org.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await su`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG.inviting}, 3, 'manual', 'complete', ${["chatgpt"]}, 1, 10, 1, 10, now() - interval '5 minutes', now())
  `;
}, 60000);

afterEach(() => {
  vi.unstubAllEnvs();
  resendSend.mockReset();
});

afterAll(async () => {
  const orgs = Object.values(ORG);
  await su`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await su`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await su`DELETE FROM notification_preferences WHERE organization_id IN ${su(orgs)}`;
  await su`DELETE FROM org_members WHERE organization_id IN ${su(orgs)}`;
  await su`DELETE FROM users WHERE organization_id IN ${su(orgs)}`;
  await su`DELETE FROM organizations WHERE id IN ${su(orgs)}`;
  await su.end();
});

/** Runs fn on a fresh visibleau_app connection, closed afterwards. */
async function asApp<T>(fn: (sql: ReturnType<typeof postgres>) => Promise<T>): Promise<T> {
  const app = postgres(appRoleUrl(), { max: 1 });
  try {
    return await fn(app);
  } finally {
    await app.end();
  }
}

async function recipientsUnder(org: string): Promise<{ user_id: string; email: string }[]> {
  return asApp((app) =>
    app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_org_id', ${org}, true)`;
      return tx<{ user_id: string; email: string }[]>`
        SELECT * FROM app_notification_recipients() ORDER BY email
      `;
    }),
  );
}

describe("resolveNotificationRecipients, as the app role", () => {
  it("includes the admin invited from another org, for every owner/admin email type", async () => {
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    for (const type of ["audit_complete", "schedule_failure", "hallucination", "drift"] as const) {
      const { enabled, recipients } = await resolveNotificationRecipients(ORG.inviting, type);
      expect(enabled, type).toBe(true);
      expect(recipients, type).toEqual([INVITED_ADMIN, OWNER]);
    }
  });

  it("never an analyst, a viewer, a pending invite, a removed admin, the placeholder or another org's admin", async () => {
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    const { recipients } = await resolveNotificationRecipients(ORG.inviting, "audit_complete");
    for (const excluded of [
      INVITED_ANALYST,
      INVITED_VIEWER,
      PENDING_ADMIN,
      REMOVED_ADMIN,
      "pending@sync.local",
      OTHER_ORG_ADMIN,
      CLOSED_ORG_ADMIN,
    ]) {
      expect(recipients).not.toContain(excluded);
    }
  });
});

describe("the audit-complete email (Inngest function), as the app role", () => {
  type Handler = (ctx: {
    event: { data: { auditId: string } };
    step: { run: (name: string, fn: () => unknown) => unknown };
  }) => Promise<unknown>;

  it("reaches the admin invited from another org, and the owner", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
    resendSend.mockResolvedValue({ data: { id: "em_cross" }, error: null, headers: null });
    const { sendAuditCompleteEmail } = await import(
      "@/inngest/functions/send-audit-complete-email"
    );

    await (sendAuditCompleteEmail as unknown as { fn: Handler }).fn({
      event: { data: { auditId: AUDIT_ID } },
      step: { run: (_name, fn) => fn() },
    });

    const sentTo = resendSend.mock.calls.map((c) => c[0].to).sort();
    expect(sentTo).toEqual([INVITED_ADMIN, OWNER]);
  });
});

describe("app_notification_recipients()", () => {
  it("returns only the context org's accepted, active owners and admins", async () => {
    const rows = await recipientsUnder(ORG.inviting);
    expect(rows).toEqual([
      { user_id: ids.invitedAdmin, email: INVITED_ADMIN },
      { user_id: ids.owner, email: OWNER },
    ]);
    expect(Object.keys(rows[0]).sort()).toEqual(["email", "user_id"]);
  });

  it("another org's context sees only that org's members", async () => {
    expect(await recipientsUnder(ORG.other)).toEqual([
      { user_id: ids.otherOrgAdmin, email: OTHER_ORG_ADMIN },
    ]);
  });

  it("a closed org: nothing", async () => {
    expect(await recipientsUnder(ORG.closed)).toEqual([]);
  });

  it("with app.current_org_id unset, empty or not a uuid: 0 rows, no error", async () => {
    await asApp(async (app) => {
      // Never set in this session.
      expect(await app`SELECT * FROM app_notification_recipients()`).toHaveLength(0);
      // Set for one transaction; afterwards the session holds ''.
      await app.begin(async (tx) => {
        await tx`SELECT set_config('app.current_org_id', ${ORG.inviting}, true)`;
      });
      expect(await app`SELECT * FROM app_notification_recipients()`).toHaveLength(0);
      await app`SELECT set_config('app.current_org_id', 'not-a-uuid', false)`;
      expect(await app`SELECT * FROM app_notification_recipients()`).toHaveLength(0);
    });
  });

  it("the app role still can't read the invited admin's profile row itself", async () => {
    const rows = await asApp((app) =>
      app.begin(async (tx) => {
        await tx`SELECT set_config('app.current_org_id', ${ORG.inviting}, true)`;
        return tx`SELECT id FROM users WHERE id = ${ids.invitedAdmin}`;
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it("is SECURITY DEFINER with a pinned search_path, owned by a NOLOGIN role with no special attributes", async () => {
    const [fn] = await su<
      { prosecdef: boolean; proconfig: string[] | null; owner: string; result: string }[]
    >`
      SELECT p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS owner,
             pg_get_function_result(p.oid) AS result
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ${FUNCTION}
    `;
    expect(fn).toBeDefined();
    expect(fn.prosecdef).toBe(true);
    expect(fn.proconfig).toEqual(["search_path=pg_catalog, pg_temp"]);
    expect(fn.owner).toBe(READER);
    expect(fn.result).toBe("TABLE(user_id uuid, email text)");

    const [role] = await su`
      SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
      FROM pg_roles WHERE rolname = ${READER}
    `;
    expect(role).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
    });
  });

  it("EXECUTE: the app role only (and its owner), never PUBLIC", async () => {
    const [{ acl }] = await su<{ acl: string[] }[]>`
      SELECT p.proacl::text[] AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ${FUNCTION}
    `;
    // A PUBLIC grant would show as an entry with no grantee ("=X/...").
    const grantees = acl.map((entry) => entry.split("=")[0]).sort();
    expect(grantees).toEqual(["visibleau_app", READER]);
  });

  it("its owner can read only the columns notifications need, and write nothing", async () => {
    const columns = await su<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.column_privileges
      WHERE grantee = ${READER} AND privilege_type = 'SELECT'
    `;
    expect(columns.map((c) => `${c.table_name}.${c.column_name}`).sort()).toEqual([
      "org_members.accepted_at",
      "org_members.is_active",
      "org_members.organization_id",
      "org_members.role",
      "org_members.user_id",
      "organizations.deleted_at",
      "organizations.id",
      "users.email",
      "users.id",
    ]);
    const tableGrants = await su`
      SELECT table_name, privilege_type FROM information_schema.table_privileges
      WHERE grantee = ${READER}
    `;
    expect(tableGrants).toHaveLength(0);
  });

  it("its one extra policy on users applies to its owner only, and only to SELECT", async () => {
    const policies = await su<{ polname: string; cmd: string; roles: string[] }[]>`
      SELECT polname, polcmd::text AS cmd, polroles::regrole[]::text[] AS roles
      FROM pg_policy
      WHERE polrelid = 'public.users'::regclass AND ${READER} = ANY (polroles::regrole[]::text[])
    `;
    expect(policies).toEqual([
      { polname: "users_notification_recipients_select", cmd: "r", roles: [READER] },
    ]);
  });
});
