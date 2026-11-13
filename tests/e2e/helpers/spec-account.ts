/**
 * One e2e account and workspace per spec (or per person in a spec), made by one helper.
 *
 * Playwright-run follow-ups (9 Nov), part 1 -- cause F, 98 of the run's 133 failures: the old sprint
 * specs and the root specs seeded their brands into "E2E-S5 Org 1" (E2E_TEST_ORG_1_CLERK_ID) and then
 * signed in as E2E_TEST_USER_1, whose profile and membership live in "VisibleAU Dev", the workspace the
 * integration suite's shared fixtures make (tests/integration/shared-fixtures.ts). Pages answered 404
 * for a brand in another workspace, and brand creation hit user 1's Free limit. Each spec now signs in
 * as an account whose workspace it seeds, the way the session and responsive specs already did, and
 * no spec moves or shares a user the integration suite owns.
 *
 * What a finished, paying sign-up leaves, and nothing more:
 * - the better-auth account (verified address, credential password, stored the way better-auth stores
 *   it, so no server is needed to make it);
 * - the workspace, with `organizations.tier` left at 'free' on purpose: plans come from
 *   `subscriptions` (lib/pricing/effective-tier.ts), so a spec that sees a plan proves that;
 * - the profile, and an active, accepted owner membership (access needs one: lib/auth/current-user.ts);
 * - a subscription row for the plan the spec needs, or none for Free.
 *
 * Keys are stable, so a run that crashed before its afterAll is cleared by the next: making an account
 * first removes whatever an earlier run left under the same key. Everything is in the local e2e
 * database only (assertSeedDatabaseUrl refuses anything else before connecting), or, for this helper's own
 * integration test, the integration tests' database (13 Nov, part 6).
 *
 * Relative imports only: tests/qa/* run under their own Playwright configs.
 */
import type { Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import { assertSeedDatabaseUrl } from "./e2e-database";

/** A plan a subscription row carries. Free is `null`: no subscription row, as a workspace that never paid. */
export type SpecPlan = "starter" | "growth" | "agency" | "agency_pro" | "enterprise";

export const SPEC_ACCOUNT_PASSWORD = "TestPass123!";

export interface SpecAccount {
  key: string;
  email: string;
  password: string;
  name: string;
  /** auth_users.id, which users.clerk_user_id holds. */
  authUserId: string;
  /** users.id: the profile. */
  userId: string;
  organizationId: string;
  /** organizations.clerk_org_id. */
  workspaceKey: string;
  workspaceName: string;
}

export interface SpecAccountOptions {
  /** Lowercase letters, digits and dashes, unique per spec and person: "sprint4", "root-05-user-2". */
  key: string;
  plan: SpecPlan | null;
  workspaceName?: string;
  name?: string;
  /**
   * A member of another spec account's workspace, with this role, instead of the owner of its own:
   * no workspace is made, and the plan is the owner's (pass `plan: null`).
   */
  memberOf?: { owner: SpecAccount; role: "admin" | "analyst" | "viewer" };
}

const KEY = /^[a-z0-9][a-z0-9-]{1,40}$/;

function namesFor(key: string) {
  if (!KEY.test(key)) {
    throw new Error(`Spec account key "${key}": use lowercase letters, digits and dashes.`);
  }
  return {
    authUserId: `e2e-spec-${key}`,
    email: `e2e-spec-${key}@test.visibleau.dev`,
    workspaceKey: `e2e-spec-${key}`,
  };
}

function connect() {
  // 13 Nov, part 6: the e2e database, or the integration tests' own when its integration test runs it.
  return postgres(assertSeedDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL"), {
    max: 1,
    onnotice: () => {},
  });
}

async function upsertPlan(
  sql: postgres.Sql | postgres.TransactionSql,
  key: string,
  orgId: string,
  plan: SpecPlan | null,
) {
  if (plan === null) {
    await sql`DELETE FROM subscriptions WHERE organization_id = ${orgId}`;
    return;
  }
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      tier, billing_interval, status, cancel_at_period_end, current_period_start, current_period_end)
    VALUES (${orgId}, ${`cus_e2e_spec_${key}`}, ${`sub_e2e_spec_${key}`}, ${`price_e2e_spec_${plan}`},
      ${plan}, 'monthly', 'active', false, now() - interval '1 day', now() + interval '30 days')
    ON CONFLICT (organization_id) DO UPDATE SET tier = EXCLUDED.tier, stripe_price_id = EXCLUDED.stripe_price_id,
      status = 'active', cancel_at_period_end = false, current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end, updated_at = now()
  `;
}

/**
 * Every row that belongs to the workspace -- by its id, its brands' ids or its audits' ids -- then
 * the workspace. Foreign keys decide the order, so each pass retries what the last one couldn't
 * delete. Anything still left is named, never left behind silently.
 */
export async function deleteWorkspaceRows(sql: postgres.Sql, orgId: string): Promise<void> {
  const brandIds = (
    await sql<{ id: string }[]>`SELECT id FROM brands WHERE organization_id = ${orgId}`
  ).map((r) => r.id);
  const auditIds = (
    await sql<{ id: string }[]>`SELECT id FROM audits WHERE organization_id = ${orgId}`
  ).map((r) => r.id);
  const owned = await sql<{ table_name: string; column_name: string }[]>`
    SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.column_name IN ('organization_id', 'brand_id', 'audit_id') AND c.table_name <> 'organizations'
  `;
  const idsFor: Record<string, string[]> = {
    organization_id: [orgId],
    brand_id: brandIds,
    audit_id: auditIds,
  };
  let pending = owned.filter((o) => idsFor[o.column_name].length > 0);
  let lastError = "";
  for (let pass = 0; pass < 8 && pending.length > 0; pass++) {
    const failed: typeof pending = [];
    for (const o of pending) {
      try {
        await sql`DELETE FROM ${sql(o.table_name)} WHERE ${sql(o.column_name)} IN ${sql(idsFor[o.column_name])}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        failed.push(o);
      }
    }
    pending = failed;
  }
  if (pending.length > 0) {
    throw new Error(
      `Workspace ${orgId}: rows left in ${pending.map((o) => o.table_name).join(", ")} (${lastError}).`,
    );
  }
  await sql`DELETE FROM organizations WHERE id = ${orgId}`;
}

async function removeByKey(sql: postgres.Sql, key: string): Promise<void> {
  const { authUserId, email, workspaceKey } = namesFor(key);
  // Only the workspace this key made: a member's profile sits in another account's workspace.
  const [own] = await sql<{ id: string }[]>`
    SELECT id FROM organizations WHERE clerk_org_id = ${workspaceKey}
  `;
  if (own) await deleteWorkspaceRows(sql, own.id);
  const [profile] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE clerk_user_id = ${authUserId}
  `;
  if (profile) {
    await sql`DELETE FROM org_members WHERE user_id = ${profile.id}`;
    await sql`DELETE FROM users WHERE id = ${profile.id}`;
  }
  const accounts = await sql<{ id: string }[]>`
    SELECT id FROM auth_users WHERE id = ${authUserId} OR email = ${email}
  `;
  for (const { id } of accounts) {
    await sql`DELETE FROM auth_sessions WHERE user_id = ${id}`;
    await sql`DELETE FROM auth_members WHERE user_id = ${id}`;
    await sql`DELETE FROM auth_accounts WHERE user_id = ${id}`;
    await sql`DELETE FROM auth_users WHERE id = ${id}`;
  }
}

/** A fresh account and workspace for this key: whatever an earlier run left under it is removed first. */
export async function createSpecAccount(options: SpecAccountOptions): Promise<SpecAccount> {
  const { authUserId, email, workspaceKey } = namesFor(options.key);
  const name = options.name ?? `E2E ${options.key}`;
  const workspaceName = options.workspaceName ?? `E2E ${options.key} workspace`;
  const { memberOf } = options;
  if (memberOf && options.plan !== null) {
    throw new Error(
      `Spec account "${options.key}" joins another workspace: its plan is the owner's.`,
    );
  }
  const passwordHash = await hashPassword(SPEC_ACCOUNT_PASSWORD);
  const sql = connect();
  try {
    await removeByKey(sql, options.key);
    return await sql.begin(async (tx) => {
      await tx`
        INSERT INTO auth_users (id, name, email, email_verified)
        VALUES (${authUserId}, ${name}, ${email}, true)
      `;
      await tx`
        INSERT INTO auth_accounts (id, account_id, provider_id, user_id, password)
        VALUES (${`${authUserId}-credential`}, ${authUserId}, 'credential', ${authUserId}, ${passwordHash})
      `;
      if (memberOf) {
        const { owner, role } = memberOf;
        const [member] = await tx<{ id: string }[]>`
          INSERT INTO users (clerk_user_id, organization_id, email, name, role)
          VALUES (${authUserId}, ${owner.organizationId}, ${email}, ${name}, ${role})
          RETURNING id
        `;
        await tx`
          INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
          VALUES (${owner.organizationId}, ${member.id}, ${role}, now(), now(), true)
        `;
        return {
          key: options.key,
          email,
          password: SPEC_ACCOUNT_PASSWORD,
          name,
          authUserId,
          userId: member.id,
          organizationId: owner.organizationId,
          workspaceKey: owner.workspaceKey,
          workspaceName: owner.workspaceName,
        };
      }
      const [org] = await tx<{ id: string }[]>`
        INSERT INTO organizations (clerk_org_id, name, slug, tier, onboarding_complete, metadata)
        VALUES (${workspaceKey}, ${workspaceName}, ${workspaceKey}, 'free', true,
          ${tx.json({ productTourComplete: true })})
        RETURNING id
      `;
      const [user] = await tx<{ id: string }[]>`
        INSERT INTO users (clerk_user_id, organization_id, email, name, role)
        VALUES (${authUserId}, ${org.id}, ${email}, ${name}, 'owner')
        RETURNING id
      `;
      await tx`
        INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
        VALUES (${org.id}, ${user.id}, 'owner', now(), now(), true)
      `;
      await upsertPlan(tx, options.key, org.id, options.plan);
      return {
        key: options.key,
        email,
        password: SPEC_ACCOUNT_PASSWORD,
        name,
        authUserId,
        userId: user.id,
        organizationId: org.id,
        workspaceKey,
        workspaceName,
      };
    });
  } finally {
    await sql.end();
  }
}

/** A brand in the account's workspace (with none, /dashboard sends the account to the wizard). */
export async function addSpecBrand(
  account: SpecAccount,
  brand: { name: string; domain: string; vertical?: string; primaryRegions?: string[] },
): Promise<string> {
  const sql = connect();
  try {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
      VALUES (${account.organizationId}, ${brand.name}, ${brand.domain}, ${brand.vertical ?? "tradies"},
        'au', ${brand.primaryRegions ?? []})
      RETURNING id
    `;
    return row.id;
  } finally {
    await sql.end();
  }
}

/** Moves the workspace to another plan; `null` is Free (the subscription row goes). */
export async function setSpecPlan(account: SpecAccount, plan: SpecPlan | null): Promise<void> {
  const sql = connect();
  try {
    await upsertPlan(sql, account.key, account.organizationId, plan);
  } finally {
    await sql.end();
  }
}

/** The account and its workspace with every row in it; for a member, its profile and membership. */
export async function removeSpecAccount(account: SpecAccount | string): Promise<void> {
  const sql = connect();
  try {
    await removeByKey(sql, typeof account === "string" ? account : account.key);
  } finally {
    await sql.end();
  }
}

function appOrigin(): string {
  return process.env.E2E_APP_URL ?? "http://localhost:3000";
}

/**
 * Through the real sign-in form. It waits until the page has left /sign-in: a workspace with no brand
 * goes to /brands/wizard, not /dashboard. 90 s: on a fresh dev server the first sign-in also compiles
 * the page it lands on (sprint4's first test ran out at 30 s, 10 Nov, with the page already at /dashboard).
 */
export async function signInThroughForm(page: Page, account: SpecAccount): Promise<void> {
  await page.goto("/sign-in");
  await page.fill('input[type="email"]', account.email);
  await page.fill('input[type="password"]', account.password);
  // Two navigations follow a sign-in: better-auth's client loads the callback URL as a new document,
  // and the form's router.push moves there in place. The in-place one can change the URL first, so
  // waiting for the URL alone let a spec's next page.goto be cut off by the document load still on
  // its way (sprint7, 10 Nov: "interrupted by another navigation to /dashboard"). Wait for that load.
  const documentLoad = page.waitForResponse(
    (r) =>
      r.request().isNavigationRequest() &&
      r.request().frame() === page.mainFrame() &&
      !new URL(r.url()).pathname.startsWith("/sign-in"),
    { timeout: 90_000 },
  );
  await page.click('button[type="submit"]');
  await documentLoad;
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    timeout: 90_000,
    waitUntil: "load",
  });
  // And let the landing page settle: a further navigation to the same page can still arrive (sprint8's
  // warm E1 run, 10 Nov: "interrupted by another navigation to /dashboard"). Bounded: a page that keeps
  // polling never goes idle.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

/** Through better-auth's sign-in route: the page's context gets the session cookie, no page loads. */
export async function signInByApi(page: Page, account: SpecAccount): Promise<void> {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: account.email, password: account.password },
    headers: { Origin: appOrigin() },
  });
  if (!res.ok()) throw new Error(`Sign-in as ${account.email} returned ${res.status()}.`);
}
