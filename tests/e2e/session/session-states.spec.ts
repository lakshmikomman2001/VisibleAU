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
 * Seeds its own accounts and rows in the e2e database (never
 * visibleau_prod) and deletes them afterwards.
 *
 * Run: npx playwright test --config tests/e2e/session/playwright.config.ts
 */
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
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
