/**
 * Live invite test follow-ups (8 Nov), part 1 -- a new address's invite opened signed out landed on "Welcome
 * back / Sign in". Now the invite page itself sends someone who isn't signed in where the invite's own type
 * says, decided on the server from the invite row: a new account to the invite sign-up, an account (with a
 * profile, or only a sign-in account: part 2) to sign-in, whose heading says who to sign in as and what it
 * joins. A token that can't be used gets the one answer, and sign-in shows nothing about it.
 *
 * The real page, sign-in page and better-auth against the test database; next/headers stands in for the
 * request (no session cookie: signed out).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { isValidElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashInviteToken, newInviteToken } from "@/lib/auth/invite-token";
import { maskEmail } from "@/lib/email/mask";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(request.cookie ? { cookie: request.cookie } : {})),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async () => ({ ok: true, id: "em_test" })),
}));

const RUN = randomUUID().slice(0, 8);
const ORG_ID = randomUUID();
const ORG_NAME = "Splice Test Agency";
const PASSWORD = "CorrectHorse123!";
const address = (label: string) => `${label}-${RUN}@signed-out-invite.example.com.au`;

let sql: ReturnType<typeof postgres>;
const orgs: string[] = [ORG_ID];

/** A pending invite as the invite route stores it: only its token's hash. */
async function pendingInvite(opts: { email: string; userId?: string | null }): Promise<string> {
  const token = newInviteToken();
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, invited_email, invitation_token_hash, invited_at, expires_at, is_active)
    VALUES (${ORG_ID}, ${opts.userId ?? null}, 'analyst', ${opts.email}, ${hashInviteToken(token)}, now(), now() + interval '7 days', false)
  `;
  return token;
}

/** What the page does: a redirect's target, "not found", or what it renders. */
async function openInvite(token: string, orgId: string = ORG_ID): Promise<string> {
  const { default: InvitePage } = await import("@/app/invite/[orgId]/[token]/page");
  try {
    const page = await InvitePage({ params: Promise.resolve({ orgId, token }) });
    return isValidElement(page) ? "rendered" : "nothing";
  } catch (e) {
    const digest = String((e as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2] ?? digest;
    if (digest === "NEXT_HTTP_ERROR_FALLBACK;404") return "not found";
    throw e;
  }
}

/** The props sign-in renders its form with, opened with `redirectTo`. */
async function signInPage(redirectTo: string): Promise<Record<string, unknown>> {
  const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");
  const page = await SignInPage({ searchParams: Promise.resolve({ redirectTo }) });
  if (!isValidElement(page)) throw new Error("sign-in rendered nothing");
  return page.props as Record<string, unknown>;
}

const back = (token: string) => encodeURIComponent(`/invite/${ORG_ID}/${token}`);

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`signed-out-${ORG_ID}`}, ${ORG_NAME}, ${`signed-out-${ORG_ID}`})
  `;
}, 60_000);

afterAll(async () => {
  const accounts = await sql<{ id: string }[]>`
    SELECT id FROM auth_users WHERE email LIKE ${`%-${RUN}@signed-out-invite.example.com.au`}
  `;
  const ids = accounts.map((a) => a.id);
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM users WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${ids})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
});

describe("the invite page, signed out", () => {
  it("a new account's invite opens the invite sign-up", async () => {
    const token = await pendingInvite({ email: address("newcomer") });
    expect(await openInvite(token)).toBe(`/sign-up?redirectTo=${back(token)}`);
    // Sign-in, if they go there instead, shows its usual form: no invite heading for a new account.
    expect((await signInPage(`/invite/${ORG_ID}/${token}`)).invite).toBeUndefined();
  });

  it("an existing account's invite opens sign-in, headed with who to sign in as and what it joins", async () => {
    const elsewhere = randomUUID();
    orgs.push(elsewhere);
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${elsewhere}, ${`signed-out-${elsewhere}`}, 'Elsewhere', ${`signed-out-${elsewhere}`})
    `;
    const email = address("sri");
    const { auth } = await import("@/lib/auth/server");
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Sri" } });
    const [{ id: accountId }] = await sql<
      { id: string }[]
    >`SELECT id FROM auth_users WHERE email = ${email}`;
    const profileId = randomUUID();
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${profileId}, ${accountId}, ${elsewhere}, ${email}, 'Sri', 'owner')
    `;
    const token = await pendingInvite({ email, userId: profileId });
    expect(await openInvite(token)).toBe(`/sign-in?redirectTo=${back(token)}`);
    expect((await signInPage(`/invite/${ORG_ID}/${token}`)).invite).toEqual({
      orgId: ORG_ID,
      token,
      maskedEmail: maskEmail(email),
      orgName: ORG_NAME,
    });
  });

  it("an account with no profile is an account too: sign-in", async () => {
    const email = address("bare");
    const { auth } = await import("@/lib/auth/server");
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Bare" } });
    const token = await pendingInvite({ email });
    expect(await openInvite(token)).toBe(`/sign-in?redirectTo=${back(token)}`);
    expect((await signInPage(`/invite/${ORG_ID}/${token}`)).invite).toMatchObject({
      maskedEmail: maskEmail(email),
      orgName: ORG_NAME,
    });
  });

  it("a token that can't be used gets the one answer, and sign-in shows nothing about it", async () => {
    const unknown = newInviteToken();
    expect(await openInvite(unknown)).toBe("not found");
    expect((await signInPage(`/invite/${ORG_ID}/${unknown}`)).invite).toBeUndefined();
    // Expired: the same.
    const expired = await pendingInvite({ email: address("late") });
    await sql`
      UPDATE org_members SET expires_at = now() - interval '1 minute'
      WHERE invitation_token_hash = ${hashInviteToken(expired)}
    `;
    expect(await openInvite(expired)).toBe("not found");
    // Not even shaped like an invite.
    expect(await openInvite("short", "not-a-uuid")).toBe("not found");
  });
});
