/**
 * Live invite test follow-ups (8 Nov), part 2 -- an address with a sign-in account but no profile (diag-0137
 * found one). The invite looked at profiles and the sign-up at sign-in accounts, so the person was told to
 * create an account and then refused: "An account already uses this address". Now "has an account" is a
 * sign-in account for the address (lib/auth/sign-in-account.ts): such an account gets the sign-in email,
 * signs in through the invite (its token proving an unverified address), and accepting makes its profile in
 * the inviting workspace (claimInviteForAccount). A new address and an existing profile are unchanged.
 *
 * Real routes and better-auth against the test database; only the inviter's session, the email send and
 * next/headers (carrying the invitee's real session cookie) stand in.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { inviteTokenFromEmail } from "@/tests/helpers/invite-email";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { sendEmailMock, currentUserMock, request } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  currentUserMock: vi.fn(),
  request: { cookie: "" },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(request.cookie ? { cookie: request.cookie } : {})),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: sendEmailMock,
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));

const RUN = randomUUID().slice(0, 8);
const BASE = "http://localhost:3000";
const APP = "https://app.vunnara.com.au";
const ORG_ID = randomUUID();
const OWNER_ID = randomUUID();
const ORG_NAME = "Splice Test Agency";
const PASSWORD = "CorrectHorse123!";
const address = (label: string) => `${label}-${RUN}@no-profile-invite.example.com.au`;
const freshIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

let sql: ReturnType<typeof postgres>;
const orgs: string[] = [ORG_ID];

interface SentEmail {
  to: string;
  text: string;
}

function lastEmailTo(to: string): SentEmail {
  const sent = sendEmailMock.mock.calls
    .map(([message]) => message as SentEmail)
    .filter((m) => m.to.toLowerCase() === to.toLowerCase());
  const last = sent.at(-1);
  if (!last) throw new Error("nothing was emailed to that address");
  return last;
}

async function inviteRoute(email: string, role = "analyst") {
  const { POST } = await import("@/app/api/organizations/[orgId]/members/invite/route");
  const res = await POST(
    new Request(`${BASE}/api/organizations/${ORG_ID}/members/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    }),
    { params: Promise.resolve({ orgId: ORG_ID }) },
  );
  expect(res.status).toBe(201);
  return inviteTokenFromEmail(sendEmailMock, email, ORG_ID);
}

async function preview(token: string, orgId = ORG_ID) {
  const { GET } = await import("@/app/api/invites/[orgId]/[token]/route");
  const res = await GET(
    new Request(`${BASE}/api/invites/${orgId}/${token}`, {
      headers: { "x-forwarded-for": freshIp() },
    }),
    { params: Promise.resolve({ orgId, token }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function signUp(token: string, name: string) {
  const { POST } = await import("@/app/api/invites/[orgId]/[token]/sign-up/route");
  const res = await POST(
    new Request(`${BASE}/api/invites/${ORG_ID}/${token}/sign-up`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": freshIp() },
      body: JSON.stringify({ name, password: PASSWORD }),
    }),
    { params: Promise.resolve({ orgId: ORG_ID, token }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** The invite sign-in: the password only; the address is the invite's. */
async function signIn(token: string, password: string, orgId = ORG_ID) {
  const { POST } = await import("@/app/api/invites/[orgId]/[token]/sign-in/route");
  const res = await POST(
    new Request(`${BASE}/api/invites/${orgId}/${token}/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": freshIp() },
      body: JSON.stringify({ password }),
    }),
    { params: Promise.resolve({ orgId, token }) },
  );
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, cookie };
}

/** The invite page's acceptance, as the signed-in account with no workspace of its own. */
async function accept(token: string, cookie: string, orgId = ORG_ID) {
  request.cookie = cookie;
  // No profile, so no workspace: what getCurrentUser answers for it.
  currentUserMock.mockResolvedValueOnce(null);
  const { GET } = await import("@/app/api/organizations/[orgId]/members/accept/route");
  const res = await GET(
    new Request(`${BASE}/api/organizations/${orgId}/members/accept?token=${token}`),
    { params: Promise.resolve({ orgId }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** A sign-in account with no profile: signed up, never verified, never made a workspace. */
async function accountWithoutProfile(email: string): Promise<string> {
  const { auth } = await import("@/lib/auth/server");
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "No Profile" } });
  const [{ id }] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${email}`;
  return id;
}

async function verified(accountId: string): Promise<boolean> {
  const [{ email_verified }] = await sql<{ email_verified: boolean }[]>`
    SELECT email_verified FROM auth_users WHERE id = ${accountId}
  `;
  return email_verified;
}

async function inviteRow(email: string, orgId = ORG_ID) {
  const [row] = await sql<
    { id: string; user_id: string | null; accepted_at: Date | null; is_active: boolean }[]
  >`
    SELECT id, user_id, accepted_at, is_active FROM org_members
    WHERE organization_id = ${orgId} AND lower(invited_email) = lower(${email})
  `;
  return row;
}

async function activeSeats(orgId = ORG_ID): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM org_members WHERE organization_id = ${orgId} AND is_active
  `;
  return n;
}

async function makeOrg(id: string, name: string, tier: string) {
  orgs.push(id);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${id}, ${`no-profile-${id}`}, ${name}, ${`no-profile-${id}`})
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${id}, ${`cus_${id}`}, ${`sub_${id}`}, 'price_test', ${tier}, 'monthly', 'active')
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  process.env.NEXT_PUBLIC_APP_URL = APP;
  sql = postgres(url, { max: 1 });
  await makeOrg(ORG_ID, ORG_NAME, "agency_pro");
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER_ID}, ${`no-profile-${OWNER_ID}`}, ${ORG_ID}, ${address("owner")}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${OWNER_ID}, 'owner', now(), now(), true)
  `;
}, 60_000);

beforeEach(() => {
  sendEmailMock.mockReset().mockResolvedValue({ ok: true, id: "email-test" });
  currentUserMock.mockResolvedValue({
    id: OWNER_ID,
    organizationId: ORG_ID,
    email: address("owner"),
    name: "Owner",
    role: "owner",
    organization: { id: ORG_ID, name: ORG_NAME },
  });
});

afterAll(async () => {
  const accounts = await sql<{ id: string }[]>`
    SELECT id FROM auth_users WHERE email LIKE ${`%-${RUN}@no-profile-invite.example.com.au`}
  `;
  const ids = accounts.map((a) => a.id);
  await sql`DELETE FROM audit_trail WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM users WHERE organization_id = ANY(${orgs}) OR clerk_user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${ids})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'team-invite:%'`;
  await sql.end();
});

describe("a sign-in account with no profile", () => {
  const email = address("bare");
  let accountId = "";
  let token = "";
  let cookie = "";

  beforeAll(async () => {
    accountId = await accountWithoutProfile(email);
  });

  it("gets the sign-in email, to the invite page; the invite points at no profile", async () => {
    token = await inviteRoute(email);
    const sent = lastEmailTo(email);
    expect(sent.text).toContain(`Accept the invitation:\n${APP}/invite/${ORG_ID}/${token}`);
    expect(sent.text).toContain("Sign in with this email address to accept.");
    expect(sent.text).not.toContain("Create your account");
    expect(await inviteRow(email)).toMatchObject({ user_id: null, accepted_at: null });
    // The invite sign-up's preview agrees: not for a new account, no address to fill in.
    expect(await preview(token)).toEqual({
      status: 200,
      body: { orgName: ORG_NAME, role: "analyst", forNewAccount: false },
    });
  });

  it("the invite sign-up refuses it: no second account, and its password untouched", async () => {
    const before = await sql`
      SELECT a.id, c.password FROM auth_users a JOIN auth_accounts c ON c.user_id = a.id
      WHERE lower(a.email) = lower(${email})
    `;
    expect(await signUp(token, "Second Account")).toEqual({
      status: 409,
      body: {
        error: "An account already uses this address. Sign in to accept the invitation.",
        code: "account_exists",
      },
    });
    const after = await sql`
      SELECT a.id, c.password FROM auth_users a JOIN auth_accounts c ON c.user_id = a.id
      WHERE lower(a.email) = lower(${email})
    `;
    expect(after).toEqual(before);
    expect(after).toHaveLength(1);
  });

  it("signs in through the invite: a wrong password is refused; the right one proves the address", async () => {
    expect(await verified(accountId)).toBe(false);
    const wrong = await signIn(token, "not-the-password-1");
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("wrong_password");
    expect(await verified(accountId)).toBe(false);

    const right = await signIn(token, PASSWORD);
    expect(right).toMatchObject({ status: 200, body: { signedIn: true } });
    expect(right.cookie).toMatch(/better-auth\.session_token=/);
    // The token, emailed only to this address, proved it.
    expect(await verified(accountId)).toBe(true);
    cookie = right.cookie;
  });

  it("accepting joins the inviting workspace: its profile there, the invited role, a seat taken", async () => {
    const seats = await activeSeats();
    expect(await accept(token, cookie)).toMatchObject({
      status: 200,
      body: { accepted: true, joined: true },
    });
    const [profile] = await sql<{ id: string; organization_id: string; role: string }[]>`
      SELECT id, organization_id, role FROM users WHERE clerk_user_id = ${accountId}
    `;
    expect(profile).toMatchObject({ organization_id: ORG_ID, role: "analyst" });
    const [membership] = await sql<
      { user_id: string; accepted: boolean; is_active: boolean; role: string }[]
    >`
      SELECT user_id, accepted_at IS NOT NULL AS accepted, is_active, role
      FROM org_members WHERE organization_id = ${ORG_ID} AND user_id = ${profile.id}
    `;
    expect(membership).toEqual({
      user_id: profile.id,
      accepted: true,
      is_active: true,
      role: "analyst",
    });
    expect(await activeSeats()).toBe(seats + 1);
  });

  it("with no free seat, joining is refused, and no profile is made", async () => {
    const full = randomUUID();
    await makeOrg(full, "Full Agency", "growth");
    const fullOwner = randomUUID();
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${fullOwner}, ${`no-profile-${fullOwner}`}, ${full}, ${address("full-owner")}, 'Owner', 'owner')
    `;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${full}, ${fullOwner}, 'owner', now(), now(), true)
    `;
    const squeezed = address("squeezed");
    const squeezedId = await accountWithoutProfile(squeezed);
    // Sent while a seat was free (the plan has since filled): only its hash is stored.
    const fullToken = `full-${randomUUID()}`;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, invited_email, invitation_token_hash, invited_at, expires_at, is_active)
      VALUES (${full}, NULL, 'viewer', ${squeezed}, ${hashInviteToken(fullToken)}, now(), now() + interval '7 days', false)
    `;
    const signedIn = await signIn(fullToken, PASSWORD, full);
    expect(signedIn.status).toBe(200);
    const refused = await accept(fullToken, signedIn.cookie, full);
    expect(refused.status).toBe(409);
    expect(String(refused.body.error)).toMatch(/no free seats/);
    expect(await sql`SELECT id FROM users WHERE clerk_user_id = ${squeezedId}`).toHaveLength(0);
  });
});

describe("unchanged", () => {
  it("a truly new address: the create-your-account email, and the invite sign-up joins it", async () => {
    const email = address("newcomer");
    const token = await inviteRoute(email);
    expect(lastEmailTo(email).text).toContain("Create your account and join:");
    expect(await preview(token)).toEqual({
      status: 200,
      body: { orgName: ORG_NAME, role: "analyst", forNewAccount: true, email },
    });
    expect(await signUp(token, "Newcomer")).toMatchObject({ status: 201, body: { joined: true } });
    // The invite sign-in is for accounts: this one is new, so it says to sign up.
    const other = address("newcomer-two");
    const otherToken = await inviteRoute(other);
    expect(await signIn(otherToken, PASSWORD)).toMatchObject({
      status: 409,
      body: { code: "no_account" },
    });
  });

  it("an existing profile: the invite points at it, and the email says to accept", async () => {
    const elsewhere = randomUUID();
    orgs.push(elsewhere);
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${elsewhere}, ${`no-profile-${elsewhere}`}, 'Elsewhere', ${`no-profile-${elsewhere}`})
    `;
    const email = address("profiled");
    const profileId = randomUUID();
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${profileId}, ${`no-profile-${profileId}`}, ${elsewhere}, ${email}, 'Profiled', 'owner')
    `;
    const token = await inviteRoute(email);
    expect(lastEmailTo(email).text).toContain(
      `Accept the invitation:\n${APP}/invite/${ORG_ID}/${token}`,
    );
    expect((await inviteRow(email)).user_id).toBe(profileId);
  });

  it("an unknown token: the one answer", async () => {
    expect(await signIn(`unknown-${randomUUID()}`, PASSWORD)).toMatchObject({
      status: 404,
      body: { code: "invite_unusable" },
    });
  });
});
