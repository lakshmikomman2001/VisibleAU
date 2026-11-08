/**
 * Follow-ups from d247ba7..f13411d, part 3 -- /api/invites is public and the token is its only key. Real
 * routes, better-auth and the Postgres rate limiter against the test database; only the inviter's session
 * and the email send are stubbed, and better-auth's hashPassword is watched (it runs as it is).
 * - The address comes from the invite row: a sign-up that sends none gets the invited address; one that
 *   sends another is refused with nothing made.
 * - A token is 256 bits, works once, and cancelling or re-sending the invite stops the old link. Only its
 *   hash is stored (follow-ups from 6e27afc..01a6a8c, part 4), so tests read it from the email, as a person
 *   would (tests/helpers/invite-email.ts).
 * - An unknown, expired or used token (or a closed workspace's) gets the same status and body, after the
 *   same work: the password is hashed whatever the token.
 * - Each public route is rate-limited per caller IP and per token: repeated bad tokens get 429.
 * - A weak password is refused by the invite sign-up and by the normal sign-up alike: one rule.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inviteTokenFromEmail } from "@/tests/helpers/invite-email";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { sendEmailMock, currentUserMock, hashSpy } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  currentUserMock: vi.fn(),
  hashSpy: vi.fn(),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: sendEmailMock,
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));
vi.mock("better-auth/crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("better-auth/crypto")>();
  return {
    ...real,
    hashPassword: async (password: string) => {
      hashSpy(password);
      return real.hashPassword(password);
    },
  };
});

const RUN = randomUUID().slice(0, 8);
const BASE = "http://localhost:3000";
const ORG_ID = randomUUID();
const OWNER_ID = randomUUID();
const PASSWORD = "CorrectHorse123!";
const UNUSABLE = {
  error:
    "This invitation link can't be used: it may have expired or already been used. Ask whoever invited you to send a new one.",
  code: "invite_unusable",
};
const address = (label: string) => `${label}-${RUN}@public-invite.example.com.au`;

let sql: ReturnType<typeof postgres>;

/** A caller IP of its own, so one test's requests never count against another's (or another run's). */
const freshIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

async function invite(email: string) {
  const { POST } = await import("@/app/api/organizations/[orgId]/members/invite/route");
  const res = await POST(
    new Request(`${BASE}/api/organizations/${ORG_ID}/members/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role: "analyst" }),
    }),
    { params: Promise.resolve({ orgId: ORG_ID }) },
  );
  expect(res.status).toBeLessThan(300);
  const { id } = await inviteRow(email);
  return { id, token: inviteTokenFromEmail(sendEmailMock, email, ORG_ID) };
}

async function inviteRow(email: string) {
  const [row] = await sql<{ id: string; invitation_token_hash: string | null }[]>`
    SELECT id, invitation_token_hash FROM org_members
    WHERE organization_id = ${ORG_ID} AND lower(invited_email) = lower(${email})
  `;
  return row;
}

async function preview(token: string, ip = freshIp()) {
  const { GET } = await import("@/app/api/invites/[orgId]/[token]/route");
  const res = await GET(
    new Request(`${BASE}/api/invites/${ORG_ID}/${token}`, { headers: { "x-forwarded-for": ip } }),
    { params: Promise.resolve({ orgId: ORG_ID, token }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
}

async function signUp(token: string, body: Record<string, unknown>, ip = freshIp()) {
  const { POST } = await import("@/app/api/invites/[orgId]/[token]/sign-up/route");
  const res = await POST(
    new Request(`${BASE}/api/invites/${ORG_ID}/${token}/sign-up`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orgId: ORG_ID, token }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const accounts = async (email: string) =>
  sql`SELECT id FROM auth_users WHERE email = ${email.toLowerCase()}`;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.vunnara.com.au";
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`public-invite-${ORG_ID}`}, 'Public Invite Agency', ${`public-invite-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER_ID}, ${`public-invite-${OWNER_ID}`}, ${ORG_ID}, ${address("owner")}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${OWNER_ID}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;
}, 60000);

beforeEach(() => {
  sendEmailMock.mockReset().mockResolvedValue({ ok: true, id: "email-test" });
  hashSpy.mockClear();
  currentUserMock.mockResolvedValue({
    id: OWNER_ID,
    organizationId: ORG_ID,
    email: address("owner"),
    name: "Owner",
    role: "owner",
    organization: { id: ORG_ID, name: "Public Invite Agency" },
  });
});

afterAll(async () => {
  const made = await sql<{ id: string }[]>`
    SELECT clerk_user_id AS id FROM users WHERE organization_id = ${ORG_ID} AND id <> ${OWNER_ID}
  `;
  const ids = made.map((r) => r.id);
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${ids})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

describe("the token", () => {
  it("is 256 bits from the CSPRNG: 43 base64url characters", async () => {
    const { token } = await invite(address("strength"));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("works once: after the sign-up, the same link gets the one refusal", async () => {
    const email = address("once");
    const { token } = await invite(email);
    expect((await signUp(token, { name: "Once", password: PASSWORD })).status).toBe(201);
    expect(await preview(token)).toMatchObject({ status: 404, body: UNUSABLE });
    expect(await signUp(token, { name: "Twice", password: PASSWORD })).toEqual({
      status: 404,
      body: UNUSABLE,
    });
  });

  it("cancelling the invite stops its link", async () => {
    const email = address("cancelled");
    const row = await invite(email);
    expect((await preview(row.token)).status).toBe(200);
    const { DELETE } = await import("@/app/api/organizations/[orgId]/members/[memberId]/route");
    const res = await DELETE(new Request(`${BASE}/x`, { method: "DELETE" }), {
      params: Promise.resolve({ orgId: ORG_ID, memberId: row.id }),
    });
    expect(res.status).toBe(200);
    expect(await preview(row.token)).toMatchObject({
      status: 404,
      body: UNUSABLE,
    });
  });

  it("re-sending the invite stops the old link; the new one works", async () => {
    const email = address("resent");
    const old = (await invite(email)).token;
    const fresh = (await invite(email)).token;
    expect(fresh).not.toBe(old);
    expect(await preview(old)).toMatchObject({ status: 404, body: UNUSABLE });
    expect((await preview(fresh)).status).toBe(200);
  });
});

describe("the address comes from the invite row", () => {
  it("a sign-up that sends no address gets the invited one", async () => {
    const email = address("Mixed-Case");
    const { token } = await invite(email);
    const { status } = await signUp(token, { name: "Row Address", password: PASSWORD });
    expect(status).toBe(201);
    expect(await accounts(email)).toHaveLength(1);
    const [profile] = await sql<{ email: string }[]>`
      SELECT email FROM users WHERE organization_id = ${ORG_ID} AND name = 'Row Address'
    `;
    expect(profile.email).toBe(email.toLowerCase());
  });

  it("a sign-up that sends another address, with a good token: refused, nothing made", async () => {
    const email = address("intended");
    const elsewhere = address("someone-else");
    const row = await invite(email);
    const before = await inviteRow(email);
    const { status, body } = await signUp(row.token, {
      name: "Other",
      email: elsewhere,
      password: PASSWORD,
    });
    expect(status).toBe(403);
    expect(body.code).toBe("wrong_account");
    expect(await accounts(email)).toHaveLength(0);
    expect(await accounts(elsewhere)).toHaveLength(0);
    expect(await inviteRow(email)).toEqual(before);
  });
});

describe("no account enumeration: unknown, expired and used tokens look the same", () => {
  let expired = "";
  let used = "";
  beforeAll(async () => {
    const expiredInvite = await invite(address("expired"));
    expired = expiredInvite.token;
    await sql`UPDATE org_members SET expires_at = now() - interval '1 minute' WHERE id = ${expiredInvite.id}`;
    // A used invite that still holds its token's hash (as rows accepted by older code do).
    used = `used-${randomUUID()}`;
    const usedProfile = randomUUID();
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${usedProfile}, ${`public-invite-used-${usedProfile}`}, ${ORG_ID}, ${address("used")}, 'Used', 'member')
    `;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token_hash, expires_at, accepted_at, is_active)
      VALUES (${ORG_ID}, ${usedProfile}, 'viewer', ${hashInviteToken(used)}, now() + interval '7 days', now(), true)
    `;
  });

  it("the preview: the same 404 and body for each", async () => {
    const unknown = `unknown-${randomUUID()}`;
    const answers = await Promise.all(
      [unknown, expired, used, "short"].map(async (token) => {
        const { status, body } = await preview(token);
        return { status, body };
      }),
    );
    for (const answer of answers) expect(answer).toEqual({ status: 404, body: UNUSABLE });
  });

  it("the sign-up: the same 404 and body for each, after hashing the password every time", async () => {
    for (const token of [`unknown-${randomUUID()}`, expired, used]) {
      hashSpy.mockClear();
      expect(await signUp(token, { name: "Probe", password: PASSWORD })).toEqual({
        status: 404,
        body: UNUSABLE,
      });
      expect(hashSpy).toHaveBeenCalledTimes(1);
    }
  });

  it("a closed workspace's invite: the same answer", async () => {
    const email = address("closed-ws");
    const { token } = await invite(email);
    await sql`UPDATE organizations SET deleted_at = now() WHERE id = ${ORG_ID}`;
    try {
      expect(await preview(token)).toMatchObject({ status: 404, body: UNUSABLE });
    } finally {
      await sql`UPDATE organizations SET deleted_at = NULL WHERE id = ${ORG_ID}`;
    }
  });
});

describe("rate limits on the public routes", () => {
  it("one caller trying token after token gets 429", async () => {
    const { INVITE_IP_LIMIT } = await import("@/lib/auth/invite-rate-limit");
    const ip = freshIp();
    for (let i = 0; i < INVITE_IP_LIMIT.max; i++) {
      expect((await preview(`guess-${randomUUID()}`, ip)).status).toBe(404);
    }
    const limited = await preview(`guess-${randomUUID()}`, ip);
    expect(limited.status).toBe(429);
    expect(Number(limited.res.headers.get("retry-after"))).toBeGreaterThan(0);
    // The sign-up counts against the same caller.
    expect(
      (await signUp(`guess-${randomUUID()}`, { name: "x", password: PASSWORD }, ip)).status,
    ).toBe(429);
  });

  it("one token tried from many places gets 429", async () => {
    const { INVITE_TOKEN_LIMIT } = await import("@/lib/auth/invite-rate-limit");
    const token = `guess-${randomUUID()}`;
    for (let i = 0; i < INVITE_TOKEN_LIMIT.max; i++) {
      expect((await preview(token)).status).toBe(404);
    }
    expect((await preview(token)).status).toBe(429);
  });
});

describe("the password rule is the normal sign-up's", () => {
  it.each([
    ["too short", "short1!"],
    ["too long", "x".repeat(129)],
  ])("%s: refused by the invite sign-up, nothing made", async (_label, password) => {
    const email = address(`weak-${password.length}`);
    const { token } = await invite(email);
    const { status, body } = await signUp(token, { name: "Weak", password });
    expect(status).toBe(400);
    expect(body).toEqual({
      error: "Use a password of 8 to 128 characters.",
      code: "weak_password",
    });
    expect(await accounts(email)).toHaveLength(0);
  });

  it.each([
    ["too short", "short1!"],
    ["too long", "x".repeat(129)],
  ])("%s: refused by the normal sign-up too", async (_label, password) => {
    const email = address(`normal-weak-${password.length}`);
    const { auth } = await import("@/lib/auth/server");
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": freshIp() },
        body: JSON.stringify({ name: "Weak", email, password }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await accounts(email)).toHaveLength(0);
  });
});
