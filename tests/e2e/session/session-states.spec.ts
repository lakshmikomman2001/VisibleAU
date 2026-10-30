/**
 * "Signing in reaches the dashboard, then the user is signed out straight
 * away" (27 Oct, production). Signs in through the real form as each
 * account state and checks the user stays signed in -- or lands on the
 * right page with a message -- and that nothing calls sign-out on the way:
 *
 * - with a workspace (email not verified, like every account today)
 * - with no workspace at all (the production case: it bounced to /sign-in)
 * - in better-auth's org but missing its app profile (sign-up's last step)
 * - after a fresh password reset
 * - with its own workspace plus an accepted membership in another org
 * - with a session that has ended (cookie present, session gone)
 * - and Sign out from the account menu, the one place that should sign out
 *
 * And making a workspace ("Create workspace" answered 404 "Org not found",
 * 30 Oct, production), through the real routes -- nothing is stubbed:
 *
 * - creating one from /no-workspace when an earlier attempt stopped
 *   half-way (the production account)
 * - finishing that half-way attempt with "Open <org>", without duplicates
 * - a brand-new sign-up through /sign-up
 * - two sign-ups with the same agency name
 *
 * Seeds its own accounts and rows in the e2e database (never
 * visibleau_prod) and deletes them afterwards.
 *
 * Run: npx playwright test --config tests/e2e/session/playwright.config.ts
 */
import { randomUUID } from "node:crypto";
import { expect, type Page, type Response, test } from "@playwright/test";
import postgres from "postgres";

const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL || DB_URL.includes("visibleau_prod")) {
  throw new Error("DATABASE_URL must point at the e2e database (load .env.test.local).");
}
const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";
const PASSWORD = "TestPass123!";
const RUN = randomUUID().slice(0, 8);
const sql = postgres(DB_URL, { max: 1 });

const createdAuthUsers: string[] = [];
const createdOrgs: string[] = [];

function emailFor(state: string) {
  return `session-${state}-${RUN}@test.visibleau.dev`;
}

async function createAccount(state: string, password = PASSWORD): Promise<string> {
  const email = emailFor(state);
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ name: `Session ${state}`, email, password }),
  });
  expect(res.ok, `sign-up returned ${res.status}`).toBe(true);
  const [user] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${email}`;
  createdAuthUsers.push(user.id);
  return user.id;
}

/** An app workspace (organisation, subscription, one brand) and this
 * account's profile in it -- what a finished sign-up leaves. */
async function giveWorkspace(authUserId: string, state: string): Promise<string> {
  const orgId = randomUUID();
  createdOrgs.push(orgId);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, onboarding_complete, metadata)
    VALUES (${orgId}, ${`session-${state}-${RUN}`}, ${`Session ${state} workspace`}, ${`session-${state}-${RUN}`},
      'agency_pro', true, ${sql.json({ productTourComplete: true })})
  `;
  await sql`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${authUserId}, ${orgId}, ${emailFor(state)}, ${`Session ${state}`}, 'owner')
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${orgId}, ${`cus_session_${state}_${RUN}`}, ${`sub_session_${state}_${RUN}`}, 'price_session', 'agency_pro', 'monthly', 'active')
  `;
  await sql`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${orgId}, 'Session Co', 'session.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  return orgId;
}

/** Every row this spec made for an org, then the org. */
async function deleteOrgRows(orgId: string) {
  await sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${orgId})`;
  const tables = await sql<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
      AND t.table_type = 'BASE TABLE' AND c.table_name <> 'organizations'
  `;
  let pending = tables.map((t) => t.table_name);
  for (let pass = 0; pass < 6 && pending.length > 0; pass++) {
    const failed: string[] = [];
    for (const table of pending) {
      try {
        await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${orgId}`;
      } catch {
        failed.push(table);
      }
    }
    pending = failed;
  }
  await sql`DELETE FROM organizations WHERE id = ${orgId}`;
}

test.afterAll(async () => {
  // Accounts made through the sign-up form.
  const signedUp = await sql<{ id: string }[]>`
    SELECT id FROM auth_users WHERE email LIKE ${`session-%-${RUN}@test.visibleau.dev`}
  `;
  createdAuthUsers.push(
    ...signedUp.map((u) => u.id).filter((id) => !createdAuthUsers.includes(id)),
  );
  // Orgs the app itself created (Create workspace / sign-up) for these accounts.
  if (createdAuthUsers.length > 0) {
    const appOrgs = await sql<{ id: string }[]>`
      SELECT o.id FROM organizations o
      JOIN auth_members m ON m.organization_id = o.clerk_org_id
      WHERE m.user_id = ANY(${createdAuthUsers})
    `;
    createdOrgs.push(...appOrgs.map((o) => o.id));
  }
  // Memberships first: one account here is a member of another test org.
  const orgIds = [...new Set(createdOrgs)];
  await sql`
    DELETE FROM org_members WHERE organization_id = ANY(${orgIds})
      OR user_id IN (SELECT id FROM users WHERE organization_id = ANY(${orgIds}))
  `;
  for (const orgId of orgIds) await deleteOrgRows(orgId);
  if (createdAuthUsers.length > 0) {
    const authOrgs = await sql<{ organization_id: string }[]>`
      SELECT organization_id FROM auth_members WHERE user_id = ANY(${createdAuthUsers})
    `;
    await sql`DELETE FROM auth_members WHERE user_id = ANY(${createdAuthUsers})`;
    const authOrgIds = authOrgs.map((o) => o.organization_id);
    if (authOrgIds.length > 0) {
      await sql`DELETE FROM auth_members WHERE organization_id = ANY(${authOrgIds})`;
      await sql`DELETE FROM auth_organizations WHERE id = ANY(${authOrgIds})`;
    }
    await sql`DELETE FROM users WHERE clerk_user_id = ANY(${createdAuthUsers})`;
    await sql`DELETE FROM auth_verifications WHERE value = ANY(${createdAuthUsers})`;
    await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${createdAuthUsers})`;
    await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${createdAuthUsers})`;
    await sql`DELETE FROM auth_users WHERE id = ANY(${createdAuthUsers})`;
  }
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'auth-email-%'`;
  await sql.end();
});

/** Every request to the sign-out endpoint while the page is open. */
function watchSignOuts(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/sign-out")) seen.push(req.url());
  });
  return seen;
}

/** As a returning visitor: the cookie banner is already answered. */
async function answerCookieBanner(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookie-consent", "declined");
    } catch {}
  });
}

/** Through the real sign-in form, then wait for wherever it settles. */
async function signInThroughForm(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page
    .waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 })
    .catch(() => {});
  // The bounce came a moment after the dashboard appeared: give it time.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
}

async function sessionEmail(page: Page): Promise<string | null> {
  const res = await page.request.get("/api/auth/get-session");
  const body = (await res.json().catch(() => null)) as { user?: { email?: string } } | null;
  return body?.user?.email ?? null;
}

/**
 * What an earlier attempt that stopped half-way leaves (the production
 * account, 30 Oct): better-auth's organisation and the account's
 * membership, made through the real route, but none of the app's rows.
 */
async function leaveHalfFinishedOrg(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/auth/organization/create", {
    data: { name, slug: `half-${RUN}-${randomUUID().slice(0, 6)}` },
    headers: { Origin: BASE },
  });
  expect(res.ok(), `organization/create returned ${res.status()}`).toBe(true);
  const { id } = (await res.json()) as { id: string };
  for (const { id: orgId } of await sql<{ id: string }[]>`
    SELECT id FROM organizations WHERE clerk_org_id = ${id}
  `) {
    await sql`DELETE FROM org_members WHERE organization_id = ${orgId}`;
    await deleteOrgRows(orgId);
  }
  return id;
}

/** The first answer from a workspace step -- sync-user, or the create route. */
function nextWorkspaceAnswer(page: Page) {
  return page.waitForResponse((res) =>
    /^\/api\/auth\/(sync-user|workspace)$/.test(new URL(res.url()).pathname),
  );
}

/**
 * "200", or a failed answer's status and body. Success navigates away at
 * once, which discards the body; a failure stays on the page, so its body
 * (e.g. 404 "Org not found") can be read and shown.
 */
async function describeAnswer(res: Response): Promise<string> {
  return res.status() === 200 ? "200" : `${res.status()} ${await res.text().catch(() => "")}`;
}

/** The app rows an account's workspace step made, to check for duplicates. */
async function workspaceRows(authUserId: string) {
  const [rows] = await sql<
    {
      auth_orgs: number;
      app_orgs: number;
      profiles: number;
      real_email: number;
      owner_rows: number;
      templates: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM auth_members WHERE user_id = ${authUserId}) AS auth_orgs,
      (SELECT count(*)::int FROM organizations o
        JOIN auth_members m ON m.organization_id = o.clerk_org_id
        WHERE m.user_id = ${authUserId}) AS app_orgs,
      (SELECT count(*)::int FROM users WHERE clerk_user_id = ${authUserId}) AS profiles,
      (SELECT count(*)::int FROM users u JOIN auth_users a ON a.id = u.clerk_user_id
        WHERE a.id = ${authUserId} AND u.email = a.email) AS real_email,
      (SELECT count(*)::int FROM org_members om JOIN users u ON u.id = om.user_id
        WHERE u.clerk_user_id = ${authUserId} AND om.role = 'owner') AS owner_rows,
      (SELECT count(*)::int FROM report_templates t JOIN users u ON u.organization_id = t.organization_id
        WHERE u.clerk_user_id = ${authUserId} AND t.is_default) AS templates
  `;
  return rows;
}

async function signUpThroughForm(page: Page, state: string, agency: string) {
  await page.goto("/sign-up");
  await page.fill("#signup-name", `Session ${state}`);
  await page.fill("#signup-agency", agency);
  await page.fill("#signup-email", emailFor(state));
  await page.fill("#signup-password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-up"), { timeout: 60_000 });
}

test("with a workspace: signs in, stays signed in across pages; nothing signs it out", async ({
  page,
}) => {
  const id = await createAccount("workspace");
  await giveWorkspace(id, "workspace");
  const [verified] = await sql<
    { email_verified: boolean }[]
  >`SELECT email_verified FROM auth_users WHERE id = ${id}`;
  expect(verified.email_verified).toBe(false); // unverified, like every account today
  await answerCookieBanner(page);
  const signOuts = watchSignOuts(page);

  await signInThroughForm(page, emailFor("workspace"));
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const link of ["Brands", "Action Center", "Overview"]) {
    await page.locator('aside[data-tour="sidebar"]').getByRole("link", { name: link }).click();
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/sign-in/);
  }
  expect(await sessionEmail(page)).toBe(emailFor("workspace"));
  expect(signOuts).toEqual([]);
});

test("with no workspace: lands on /no-workspace, still signed in (it bounced to /sign-in)", async ({
  page,
}) => {
  await createAccount("none");
  await answerCookieBanner(page);
  const signOuts = watchSignOuts(page);

  await signInThroughForm(page, emailFor("none"));
  await expect(page).toHaveURL(/\/no-workspace$/);
  await expect(
    page.getByRole("heading", { name: "You're signed in, without a workspace" }),
  ).toBeVisible();
  await expect(page.getByText(emailFor("none"))).toBeVisible();
  expect(await sessionEmail(page)).toBe(emailFor("none"));

  // Any signed-in page sends it here too -- never to the sign-in form.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/no-workspace$/);
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/no-workspace$/);

  // The way in: create a workspace.
  await page.getByLabel(/Name your workspace/).fill(`Session None ${RUN}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/no-workspace"), { timeout: 30_000 });
  await expect(page).toHaveURL(/\/(dashboard|brands\/wizard)/);
  expect(await sessionEmail(page)).toBe(emailFor("none"));
  expect(signOuts).toEqual([]);
});

test("in better-auth's org but missing its app profile: 'Open <org>' reconnects it", async ({
  page,
}) => {
  const id = await createAccount("linked");
  const authOrgId = `session-linked-auth-${RUN}`;
  await sql`INSERT INTO auth_organizations (id, name, slug) VALUES (${authOrgId}, ${`Linked ${RUN}`}, ${`linked-${RUN}`})`;
  await sql`INSERT INTO auth_members (id, organization_id, user_id, role) VALUES (${randomUUID()}, ${authOrgId}, ${id}, 'owner')`;
  const orgId = randomUUID();
  createdOrgs.push(orgId);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${orgId}, ${authOrgId}, ${`Linked ${RUN}`}, ${`session-linked-${RUN}`})
  `;
  await answerCookieBanner(page);
  const signOuts = watchSignOuts(page);

  await signInThroughForm(page, emailFor("linked"));
  await expect(page).toHaveURL(/\/no-workspace$/);
  await page.getByRole("button", { name: `Open Linked ${RUN}` }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/no-workspace"), { timeout: 30_000 });
  await expect(page).toHaveURL(/\/(dashboard|brands\/wizard)/);
  expect(await sessionEmail(page)).toBe(emailFor("linked"));
  expect(signOuts).toEqual([]);
});

test("after a fresh password reset: signs in with the new password and stays", async ({ page }) => {
  const id = await createAccount("reset");
  await giveWorkspace(id, "reset");
  const requested = await page.request.post("/api/auth/request-password-reset", {
    data: { email: emailFor("reset"), redirectTo: "/reset-password" },
    headers: { Origin: BASE },
  });
  expect(requested.ok()).toBe(true);
  // better-auth stores "reset-password:<token>" with the user id as its value.
  await expect
    .poll(async () => (await sql`SELECT 1 FROM auth_verifications WHERE value = ${id}`).length)
    .toBeGreaterThan(0);
  const [row] = await sql<{ identifier: string }[]>`
    SELECT identifier FROM auth_verifications WHERE value = ${id} AND identifier LIKE 'reset-password:%'
  `;
  const reset = await page.request.post("/api/auth/reset-password", {
    data: { token: row.identifier.replace("reset-password:", ""), newPassword: "NewPass456!" },
    headers: { Origin: BASE },
  });
  expect(reset.ok(), `reset-password returned ${reset.status()}`).toBe(true);

  await answerCookieBanner(page);
  const signOuts = watchSignOuts(page);
  await signInThroughForm(page, emailFor("reset"), "NewPass456!");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await sessionEmail(page)).toBe(emailFor("reset"));
  expect(signOuts).toEqual([]);
});

test("its own workspace plus an accepted membership in another org: stays in its own", async ({
  page,
}) => {
  const id = await createAccount("member");
  const ownOrg = await giveWorkspace(id, "member");
  const otherOrg = await giveWorkspace(await createAccount("member-other"), "member-other");
  const [profile] = await sql<{ id: string }[]>`SELECT id FROM users WHERE clerk_user_id = ${id}`;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${otherOrg}, ${profile.id}, 'admin', now(), now(), true)
  `;
  expect(ownOrg).not.toBe(otherOrg);
  await answerCookieBanner(page);
  const signOuts = watchSignOuts(page);

  await signInThroughForm(page, emailFor("member"));
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('aside[data-tour="sidebar"]')).toContainText(
    "Session member workspace",
  );
  expect(await sessionEmail(page)).toBe(emailFor("member"));
  expect(signOuts).toEqual([]);
});

test("a session that has ended: the sign-in page says so, not a silent bounce", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "better-auth.session_token", value: "ended-session.not-valid", url: BASE },
  ]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?reason=session-ended/);
  await expect(page.getByText("Your session ended. Please sign in again.")).toBeVisible();
});

test("Sign out from the account menu is the one thing that signs out", async ({ page }) => {
  const id = await createAccount("signout");
  await giveWorkspace(id, "signout");
  await answerCookieBanner(page);
  const signOuts = watchSignOuts(page);

  await signInThroughForm(page, emailFor("signout"));
  await expect(page).toHaveURL(/\/dashboard$/);
  const sidebar = page.locator('aside[data-tour="sidebar"]');
  await sidebar.getByRole("button", { name: "Open user menu" }).click();
  expect(signOuts).toEqual([]);
  await sidebar.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
  expect(signOuts.length).toBe(1);
  expect(await sessionEmail(page)).toBeNull();
});

test("after a half-finished attempt: 'Create workspace' makes one and lands on the dashboard (it answered 404 'Org not found')", async ({
  page,
}) => {
  const id = await createAccount("create");
  await answerCookieBanner(page);
  const signOuts = watchSignOuts(page);
  await signInThroughForm(page, emailFor("create"));
  await expect(page).toHaveURL(/\/no-workspace$/);
  await leaveHalfFinishedOrg(page, `Earlier attempt ${RUN}`);
  await page.reload();

  await page.getByLabel(/Name your workspace/).fill(`vun ${RUN}`);
  const answer = nextWorkspaceAnswer(page);
  await page.getByRole("button", { name: "Create workspace" }).click();
  const res = await answer;
  expect(await describeAnswer(res)).toBe("200");
  await page.waitForURL((url) => !url.pathname.startsWith("/no-workspace"), { timeout: 30_000 });
  await expect(page).toHaveURL(/\/(dashboard|brands\/wizard)/);

  const [profile] = await sql<{ name: string }[]>`
    SELECT o.name FROM users u JOIN organizations o ON o.id = u.organization_id
    WHERE u.clerk_user_id = ${id}
  `;
  expect(profile?.name).toBe(`vun ${RUN}`);
  expect(await sessionEmail(page)).toBe(emailFor("create"));
  expect(signOuts).toEqual([]);
});

test("a half-finished attempt (better-auth org, no app workspace): 'Open <org>' finishes it, no duplicates", async ({
  page,
}) => {
  const id = await createAccount("retry");
  await answerCookieBanner(page);
  await signInThroughForm(page, emailFor("retry"));
  const orgName = `Half Done ${RUN}`;
  await leaveHalfFinishedOrg(page, orgName);
  await page.reload();
  expect(await workspaceRows(id)).toMatchObject({ auth_orgs: 1, app_orgs: 0, profiles: 0 });

  const answer = nextWorkspaceAnswer(page);
  await page.getByRole("button", { name: `Open ${orgName}` }).click();
  const res = await answer;
  expect(await describeAnswer(res)).toBe("200");
  await page.waitForURL((url) => !url.pathname.startsWith("/no-workspace"), { timeout: 30_000 });
  await expect(page).toHaveURL(/\/(dashboard|brands\/wizard)/);

  // Retried again by name (a repeat request): the same one, not a second.
  const again = await page.request.post("/api/auth/workspace", { data: { name: orgName } });
  expect(again.status()).toBe(200);
  expect(await workspaceRows(id)).toEqual({
    auth_orgs: 1,
    app_orgs: 1,
    profiles: 1,
    real_email: 1,
    owner_rows: 1,
    templates: 1,
  });
  expect(await sessionEmail(page)).toBe(emailFor("retry"));
});

test("a brand-new sign-up through /sign-up reaches the dashboard with its workspace", async ({
  page,
}) => {
  await answerCookieBanner(page);
  const signOuts = watchSignOuts(page);
  const answer = nextWorkspaceAnswer(page);
  await signUpThroughForm(page, "signup", `Signup Agency ${RUN}`);
  const res = await answer;
  expect(await describeAnswer(res)).toBe("200");
  // A new workspace's dashboard sends it on to add its first brand.
  await expect(page).toHaveURL(/\/(dashboard|brands\/wizard)/);
  await expect(page.locator('aside[data-tour="sidebar"]')).toContainText(`Signup Agency ${RUN}`);

  const [account] = await sql<{ id: string }[]>`
    SELECT id FROM auth_users WHERE email = ${emailFor("signup")}
  `;
  expect(await workspaceRows(account.id)).toEqual({
    auth_orgs: 1,
    app_orgs: 1,
    profiles: 1,
    real_email: 1,
    owner_rows: 1,
    templates: 1,
  });
  expect(await sessionEmail(page)).toBe(emailFor("signup"));
  expect(signOuts).toEqual([]);
});

test("two sign-ups with the same agency name both get their own workspace", async ({ browser }) => {
  const agency = `Same Name ${RUN}`;
  const workspaces: string[] = [];
  for (const state of ["same-a", "same-b"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await answerCookieBanner(page);
    await signUpThroughForm(page, state, agency);
    await expect(page).toHaveURL(/\/(dashboard|brands\/wizard)/);
    const [row] = await sql<{ organization_id: string }[]>`
      SELECT u.organization_id FROM users u JOIN auth_users a ON a.id = u.clerk_user_id
      WHERE a.email = ${emailFor(state)}
    `;
    expect(row, `${state} has no workspace`).toBeDefined();
    workspaces.push(row.organization_id);
    await context.close();
  }
  expect(new Set(workspaces).size).toBe(2);
  const named =
    await sql`SELECT 1 FROM organizations WHERE id = ANY(${workspaces}) AND name = ${agency}`;
  expect(named.length).toBe(2);
});
