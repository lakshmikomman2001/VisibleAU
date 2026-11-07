/**
 * Team follow-ups (31 Oct), item 4 -- inviting an address that has never signed up. It answered "User not
 * found". Now the invite is made (no profile yet: org_members.user_id NULL, migration 0131) and emailed with
 * a link to sign-up; signing up through it links the new account to the invite by its token, in one
 * transaction, and lands it in the inviting workspace with the invited role and no workspace of its own.
 * Real routes and better-auth against the test database; only the session for the inviter and the email
 * send are stubbed.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { sendEmailMock, currentUserMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  currentUserMock: vi.fn(),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: sendEmailMock,
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));

const RUN = randomUUID().slice(0, 8);
const APP = "https://app.vunnara.com.au";
const BASE = "http://localhost:3000";
const ORG_ID = randomUUID();
const OWNER_ID = randomUUID();
const PASSWORD = "CorrectHorse123!";
const NEWCOMER = `Newcomer-${RUN}@new-account-invite.example.com.au`;
const LATE = `late-${RUN}@new-account-invite.example.com.au`;
const TAKEN = `taken-${RUN}@new-account-invite.example.com.au`;
const SESSION_COOKIE = /better-auth\.session_token=[^;]+/;

let sql: ReturnType<typeof postgres>;

async function invite(email: string, role = "analyst") {
  const { POST } = await import("@/app/api/organizations/[orgId]/members/invite/route");
  const res = await POST(
    new Request(`${BASE}/api/organizations/${ORG_ID}/members/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    }),
    { params: Promise.resolve({ orgId: ORG_ID }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function preview(token: string) {
  const { GET } = await import("@/app/api/invites/[orgId]/[token]/route");
  const res = await GET(new Request(`${BASE}/api/invites/${ORG_ID}/${token}`), {
    params: Promise.resolve({ orgId: ORG_ID, token }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function signUp(token: string, email: string, name = "Lee Newcomer") {
  const { POST } = await import("@/app/api/invites/[orgId]/[token]/sign-up/route");
  const res = await POST(
    new Request(`${BASE}/api/invites/${ORG_ID}/${token}/sign-up`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": "10.7.7.7" },
      body: JSON.stringify({ name, email, password: PASSWORD }),
    }),
    { params: Promise.resolve({ orgId: ORG_ID, token }) },
  );
  return { res, body: (await res.json()) as Record<string, unknown> };
}

async function inviteRow(address: string) {
  const [row] = await sql<
    {
      id: string;
      user_id: string | null;
      role: string;
      invitation_token: string | null;
      accepted_at: Date | null;
      is_active: boolean;
      invited_email: string;
      expires_at: Date;
    }[]
  >`
    SELECT id, user_id, role, invitation_token, accepted_at, is_active, invited_email, expires_at
    FROM org_members WHERE organization_id = ${ORG_ID} AND lower(invited_email) = lower(${address})
  `;
  return row;
}

async function accountsFor(address: string) {
  return sql<{ id: string; email_verified: boolean }[]>`
    SELECT id, email_verified FROM auth_users WHERE email = ${address.toLowerCase()}
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  process.env.NEXT_PUBLIC_APP_URL = APP;
  sql = postgres(url, { max: 1 });

  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`new-account-${ORG_ID}`}, 'Splice Test Agency', ${`new-account-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER_ID}, ${`new-account-${OWNER_ID}`}, ${ORG_ID}, ${`owner-${RUN}@new-account-invite.example.com.au`}, 'Sri Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${OWNER_ID}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;
  // An account that already has the address TAKEN.
  await sql`
    INSERT INTO auth_users (id, name, email, email_verified)
    VALUES (${`new-account-taken-${RUN}`}, 'Taken', ${TAKEN.toLowerCase()}, true)
  `;
  currentUserMock.mockResolvedValue({
    id: OWNER_ID,
    organizationId: ORG_ID,
    email: `owner-${RUN}@new-account-invite.example.com.au`,
    name: "Sri Owner",
    role: "owner",
    organization: { id: ORG_ID, name: "Splice Test Agency" },
  });
}, 60000);

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, id: "em_1" });
});

afterAll(async () => {
  const accounts = await sql<{ id: string }[]>`
    SELECT id FROM auth_users WHERE email LIKE ${`%-${RUN}@new-account-invite.example.com.au`}
  `;
  const ids = accounts.map((a) => a.id);
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID} OR clerk_user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${ids})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'team-invite:%'`;
  await sql.end();
});

describe("inviting an address that has never signed up", () => {
  let token = "";

  it("makes the invite and emails a link to sign-up, not 'User not found'", async () => {
    const { status, body } = await invite(NEWCOMER);
    expect(status).toBe(201);
    expect(body).toMatchObject({ resent: false, emailSent: true });

    const row = await inviteRow(NEWCOMER);
    expect(row).toMatchObject({
      user_id: null,
      role: "analyst",
      accepted_at: null,
      is_active: false,
      invited_email: NEWCOMER,
    });
    const days = (row.expires_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    token = row.invitation_token ?? "";

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent.to).toBe(NEWCOMER);
    expect(sent.text).toContain(
      `Create your account and join:\n${APP}/sign-up?redirectTo=${encodeURIComponent(`/invite/${ORG_ID}/${token}`)}`,
    );
  });

  it("the sign-up page's preview has the address to lock, the workspace and the role", async () => {
    const { status, body } = await preview(token);
    expect(status).toBe(200);
    expect(body).toEqual({
      orgName: "Splice Test Agency",
      role: "analyst",
      forNewAccount: true,
      email: NEWCOMER,
    });
  });

  it("a different address can't use it: refused, nothing made", async () => {
    const other = `other-${RUN}@new-account-invite.example.com.au`;
    const { res, body } = await signUp(token, other);
    expect(res.status).toBe(403);
    expect(body).toMatchObject({ code: "wrong_account" });
    expect(String(body.error)).toContain("N***@new-account-invite.example.com.au");
    expect(await accountsFor(other)).toEqual([]);
    expect((await inviteRow(NEWCOMER)).user_id).toBeNull();
  });

  it("signing up lands in the inviting workspace with the invited role, verified, signed in, with no workspace of its own", async () => {
    const { res, body } = await signUp(token, NEWCOMER);
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ joined: true, signedIn: true });
    expect(res.headers.getSetCookie().some((c) => SESSION_COOKIE.test(c))).toBe(true);

    const [account] = await accountsFor(NEWCOMER);
    expect(account.email_verified).toBe(true);
    const [profile] = await sql<
      { id: string; organization_id: string; role: string; email: string }[]
    >`
      SELECT id, organization_id, role, email FROM users WHERE clerk_user_id = ${account.id}
    `;
    expect(profile).toMatchObject({
      organization_id: ORG_ID,
      role: "analyst",
      email: NEWCOMER.toLowerCase(),
    });
    expect(await inviteRow(NEWCOMER)).toMatchObject({
      user_id: profile.id,
      accepted_at: expect.any(Date),
      is_active: true,
      invitation_token: null,
    });
    // No workspace of its own: no better-auth organisation, and the only app workspace is the inviting one.
    const [{ owned }] = await sql<{ owned: number }[]>`
      SELECT count(*)::int AS owned FROM auth_members WHERE user_id = ${account.id}
    `;
    expect(owned).toBe(0);
    const memberships = await sql<{ organization_id: string }[]>`
      SELECT organization_id FROM org_members WHERE user_id = ${profile.id}
    `;
    expect(memberships).toEqual([{ organization_id: ORG_ID }]);

    // The password works through better-auth's own sign-in.
    const { auth } = await import("@/lib/auth/server");
    const again = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: BASE,
          "x-forwarded-for": "10.7.7.8",
        },
        body: JSON.stringify({ email: NEWCOMER, password: PASSWORD }),
      }),
    );
    expect(again.status).toBe(200);
  });

  it("the link can't be used twice", async () => {
    const { res } = await signUp(token, NEWCOMER, "Someone Else");
    expect(res.status).toBe(404);
    expect(await accountsFor(NEWCOMER)).toHaveLength(1);
  });
});

describe("an invite that can't be used for sign-up", () => {
  it("an expired one is refused, and nothing is made", async () => {
    expect((await invite(LATE)).status).toBe(201);
    const row = await inviteRow(LATE);
    await sql`UPDATE org_members SET expires_at = now() - interval '1 minute' WHERE id = ${row.id}`;
    const token = row.invitation_token ?? "";

    expect(await preview(token)).toMatchObject({
      status: 410,
      body: { error: expect.stringMatching(/expired/) },
    });
    const { res, body } = await signUp(token, LATE);
    expect(res.status).toBe(410);
    expect(String(body.error)).toMatch(/expired/);
    expect(await accountsFor(LATE)).toEqual([]);
    expect((await inviteRow(LATE)).user_id).toBeNull();
  });

  it("an address that already has an account: sign in instead, nothing changed", async () => {
    expect((await invite(TAKEN)).status).toBe(201);
    const row = await inviteRow(TAKEN);
    const { res, body } = await signUp(row.invitation_token ?? "", TAKEN);
    expect(res.status).toBe(409);
    expect(body).toMatchObject({ code: "account_exists" });
    expect(await inviteRow(TAKEN)).toMatchObject({ user_id: null, accepted_at: null });
  });

  it("no seat left since the plan shrank: refused, nothing made", async () => {
    const address = `squeezed-${RUN}@new-account-invite.example.com.au`;
    expect((await invite(address)).status).toBe(201);
    const row = await inviteRow(address);
    // The plan cancelled: effectiveTier counts it as free, one seat, which the owner fills.
    await sql`UPDATE subscriptions SET status = 'canceled' WHERE organization_id = ${ORG_ID}`;
    try {
      const { res, body } = await signUp(row.invitation_token ?? "", address);
      expect(res.status).toBe(409);
      expect(String(body.error)).toMatch(/no free seat/);
      expect(await accountsFor(address)).toEqual([]);
    } finally {
      await sql`UPDATE subscriptions SET status = 'active' WHERE organization_id = ${ORG_ID}`;
    }
  });
});

describe("sending invites to an address with no account", () => {
  it("re-inviting re-sends the one invite, and the hourly limit still applies", async () => {
    const address = `again-${RUN}@new-account-invite.example.com.au`;
    expect((await invite(address)).status).toBe(201);
    const first = await inviteRow(address);
    expect((await invite(address, "viewer")).status).toBe(200);
    const second = await inviteRow(address);
    expect(second.id).toBe(first.id);
    expect(second.role).toBe("viewer");
    expect(second.invitation_token).not.toBe(first.invitation_token);
    const [{ rows }] = await sql<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM org_members
      WHERE organization_id = ${ORG_ID} AND lower(invited_email) = lower(${address})
    `;
    expect(rows).toBe(1);
    expect((await invite(address)).status).toBe(200);
    sendEmailMock.mockClear();
    expect((await invite(address)).status).toBe(429);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("a full plan refuses it, as for anyone", async () => {
    await sql`UPDATE subscriptions SET tier = 'starter' WHERE organization_id = ${ORG_ID}`;
    try {
      const { status, body } = await invite(`full-${RUN}@new-account-invite.example.com.au`);
      expect(status).toBe(409);
      expect(String(body.error)).toMatch(/Your plan includes \d+ seat/);
    } finally {
      await sql`UPDATE subscriptions SET tier = 'agency_pro' WHERE organization_id = ${ORG_ID}`;
    }
  });
});
