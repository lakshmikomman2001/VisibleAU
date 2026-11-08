/**
 * 3 Nov ("Require a verified email, gently for the 5 existing unverified
 * accounts") -- through better-auth's own HTTP handler, as the browser's requests
 * go, on the local test database. Only the send itself is a stand-in:
 * - a new sign-up gets no session until it's verified;
 * - an unverified sign-in gets no session and an email, at most 3 an hour, shared
 *   with the Resend link;
 * - the link verifies once, starts no session, and expires;
 * - a password reset proves the address, and ends every other session;
 * - accepting an invite proves it, only if the invite went to that address.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: sendEmailMock,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(request.cookie ? { cookie: request.cookie } : {})),
}));

const RUN = randomUUID().slice(0, 8);
const BASE = "http://localhost:3000";
const PASSWORD = "CorrectHorse123!";
const SESSION_COOKIE = /better-auth\.session_token=[^;]+/;
const ORG = randomUUID();
const OTHER_ORG = randomUUID();

let sql: ReturnType<typeof postgres>;
type Auth = typeof import("@/lib/auth/server").auth;
let auth: Auth;
const addresses: string[] = [];
let addressNumber = 0;

function freshAddress(): string {
  const address = `person${++addressNumber}-${RUN}@verification.example.com.au`;
  addresses.push(address);
  return address;
}

function post(path: string, body: unknown, ip = `10.9.${addressNumber % 250}.${Date.now() % 250}`) {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip, origin: BASE },
      body: JSON.stringify(body),
    }),
  );
}

const signUp = (email: string, callbackURL = "/dashboard") =>
  post("/sign-up/email", { name: "Person", email, password: PASSWORD, callbackURL });
const signIn = (email: string, callbackURL = "/dashboard") =>
  post("/sign-in/email", { email, password: PASSWORD, callbackURL });
const resend = (email: string, callbackURL = "/dashboard") =>
  post("/send-verification-email", { email, callbackURL });

function hasSession(res: Response): boolean {
  return res.headers.getSetCookie().some((c) => SESSION_COOKIE.test(c));
}

const isVerified = async (email: string) => {
  const [row] = await sql<{ email_verified: boolean }[]>`
    SELECT email_verified FROM auth_users WHERE email = ${email}
  `;
  return row?.email_verified;
};

/** Sends happen after the response. */
async function emailsTo(address: string, atLeast = 1) {
  await vi.waitFor(() => {
    expect(mailTo(address).length).toBeGreaterThanOrEqual(atLeast);
  });
  return mailTo(address);
}

function mailTo(address: string): Array<{ subject: string; html: string; text: string }> {
  return sendEmailMock.mock.calls.map((c) => c[0]).filter((m) => m.to === address);
}

/** Long enough for a send that was going to happen to have happened. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

function linkIn(mail: { text: string }): string {
  const match = mail.text.match(/https?:\/\/\S+verify-email\S+/);
  if (!match) throw new Error("no verification link in the email");
  return match[0];
}

const open = (link: string) => auth.handler(new Request(link, { method: "GET" }));

/** An account that has finished verifying, signed in. */
async function verifiedAccount(address: string) {
  await signUp(address);
  const [mail] = await emailsTo(address);
  await open(linkIn(mail));
  const res = await signIn(address);
  expect(res.status).toBe(200);
  return res;
}

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  sendEmailMock.mockResolvedValue({ ok: true, id: "em_1" });
  ({ auth } = await import("@/lib/auth/server"));
  for (const [id, tag] of [
    [ORG, "verify-a"],
    [OTHER_ORG, "verify-b"],
  ]) {
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug, tier)
      VALUES (${id}, ${`${tag}-${RUN}`}, ${`${tag} ${RUN}`}, ${`${tag}-${RUN}`}, 'agency')
    `;
  }
}, 60_000);

afterAll(async () => {
  vi.useRealTimers();
  const rows = await sql<
    { id: string }[]
  >`SELECT id FROM auth_users WHERE email = ANY(${addresses})`;
  const ids = rows.map((r) => r.id);
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${[ORG, OTHER_ORG]})`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ANY(${[ORG, OTHER_ORG]})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${[ORG, OTHER_ORG]})`;
  await sql`DELETE FROM users WHERE organization_id = ANY(${[ORG, OTHER_ORG]})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${[ORG, OTHER_ORG]})`;
  await sql`DELETE FROM auth_verifications WHERE value = ANY(${ids})`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${ids})`;
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'auth-email-%'`;
  await sql.end();
});

beforeEach(() => {
  request.cookie = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a new sign-up", () => {
  it("gets no session until it's verified, and one email", async () => {
    const address = freshAddress();
    const res = await signUp(address);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { token: unknown }).token).toBeNull();
    expect(hasSession(res)).toBe(false);
    expect(await isVerified(address)).toBe(false);
    await emailsTo(address);
    await settle();
    expect(mailTo(address)).toHaveLength(1);
  });

  it("the email is plain and branded: HTML and a text part, with the link in both", async () => {
    const address = freshAddress();
    await signUp(address);
    const [mail] = await emailsTo(address);
    const { PRODUCT_NAME } = await import("@/lib/product");
    expect(mail.subject).toContain(PRODUCT_NAME);
    expect(mail.text).toContain("verify-email");
    expect(mail.html).toContain("verify-email");
    expect(mail.text).toMatch(/24 hours/);
  });

  it("signing up again with that address answers the same, with no session and no email", async () => {
    const address = freshAddress();
    await signUp(address);
    await emailsTo(address);
    const again = await signUp(address);
    expect(again.status).toBe(200);
    expect(hasSession(again)).toBe(false);
    await settle();
    expect(mailTo(address)).toHaveLength(1);
  });
});

describe("an unverified sign-in", () => {
  it("gets no session, is told why, and sends the email once", async () => {
    const address = freshAddress();
    await signUp(address);
    await emailsTo(address);
    sendEmailMock.mockClear();

    const res = await signIn(address);
    expect(res.status).toBe(403);
    expect(hasSession(res)).toBe(false);
    expect(((await res.json()) as { code: string }).code).toBe("EMAIL_NOT_VERIFIED");
    await emailsTo(address);
    await settle();
    expect(mailTo(address)).toHaveLength(1);
  });

  it("the wrong password sends nothing", async () => {
    const address = freshAddress();
    await signUp(address);
    await emailsTo(address);
    sendEmailMock.mockClear();
    const res = await post("/sign-in/email", { email: address, password: "not-the-password" });
    expect(res.status).toBe(401);
    await settle();
    expect(mailTo(address)).toHaveLength(0);
  });

  it("repeating it sends at most 3 an hour, and it never gets a session", async () => {
    const address = freshAddress();
    await signUp(address);
    await emailsTo(address);
    for (let i = 0; i < 4; i++) {
      const res = await signIn(address);
      expect(res.status).toBe(403);
      expect(hasSession(res)).toBe(false);
    }
    await settle();
    expect(mailTo(address)).toHaveLength(3);
  });
});

describe("the Resend link", () => {
  it("sends another, and shares the same 3 an hour with sign-in", async () => {
    const address = freshAddress();
    await signUp(address);
    await emailsTo(address);
    expect((await resend(address)).status).toBe(200);
    await emailsTo(address, 2);
    expect((await resend(address)).status).toBe(200);
    await emailsTo(address, 3);

    const refused = await resend(address);
    expect(refused.status).toBe(429);
    await settle();
    expect(mailTo(address)).toHaveLength(3);
  });

  it("answers an address with no account the same way, and sends nothing", async () => {
    const address = freshAddress();
    const res = await resend(address);
    expect(res.status).toBe(200);
    await settle();
    expect(mailTo(address)).toHaveLength(0);
  });
});

describe("the emailed link", () => {
  it("verifies once, lands on sign-in saying so, and starts no session", async () => {
    const address = freshAddress();
    await signUp(address, "/no-workspace?name=Harbour%20Agency");
    const [mail] = await emailsTo(address);

    const first = await open(linkIn(mail));
    expect(first.status).toBe(302);
    const landing = new URL(first.headers.get("location") ?? "", BASE);
    expect(landing.pathname).toBe("/sign-in");
    expect(landing.searchParams.get("verified")).toBe("1");
    expect(landing.searchParams.get("redirectTo")).toBe("/no-workspace?name=Harbour%20Agency");
    expect(hasSession(first)).toBe(false);
    expect(await isVerified(address)).toBe(true);

    // Then the person signs in, with the password they chose.
    const res = await signIn(address, "/no-workspace?name=Harbour%20Agency");
    expect(res.status).toBe(200);
    expect(hasSession(res)).toBe(true);
  });

  it("a second click changes nothing, and still starts no session", async () => {
    const address = freshAddress();
    await signUp(address);
    const [mail] = await emailsTo(address);
    await open(linkIn(mail));
    await sql`UPDATE auth_users SET updated_at = '2020-06-15T00:00:00Z' WHERE email = ${address}`;

    const second = await open(linkIn(mail));
    expect(second.status).toBe(302);
    expect(hasSession(second)).toBe(false);
    const [row] = await sql<{ updated_at: Date }[]>`
      SELECT updated_at FROM auth_users WHERE email = ${address}
    `;
    expect(row.updated_at.getUTCFullYear()).toBe(2020);
  });

  it("expires after 24 hours: it verifies nothing and says so", async () => {
    const address = freshAddress();
    await signUp(address);
    const [mail] = await emailsTo(address);

    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 25 * 60 * 60 * 1000 });
    const res = await open(linkIn(mail));
    vi.useRealTimers();
    expect(res.status).toBe(302);
    const landing = new URL(res.headers.get("location") ?? "", BASE);
    expect(landing.pathname).toBe("/sign-in");
    expect(landing.searchParams.get("error")).toBe("TOKEN_EXPIRED");
    expect(await isVerified(address)).toBe(false);
  });

  it("just inside 24 hours it still works", async () => {
    const address = freshAddress();
    await signUp(address);
    const [mail] = await emailsTo(address);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 23 * 60 * 60 * 1000 });
    await open(linkIn(mail));
    vi.useRealTimers();
    expect(await isVerified(address)).toBe(true);
  });

  it("a link someone tampered with verifies nothing", async () => {
    const address = freshAddress();
    await signUp(address);
    const [mail] = await emailsTo(address);
    const res = await open(linkIn(mail).replace(/token=[^&]+/, "token=not.a.token"));
    expect(new URL(res.headers.get("location") ?? "", BASE).searchParams.get("error")).toBe(
      "INVALID_TOKEN",
    );
    expect(await isVerified(address)).toBe(false);
  });
});

describe("a verified account", () => {
  it("signs in, with no email", async () => {
    const address = freshAddress();
    await verifiedAccount(address);
    sendEmailMock.mockClear();
    const res = await signIn(address);
    expect(res.status).toBe(200);
    expect(hasSession(res)).toBe(true);
    await settle();
    expect(mailTo(address)).toHaveLength(0);
  });
});

describe("an account that was unverified when this shipped", () => {
  it("nothing marks it verified, and it verifies by signing in and opening the link", async () => {
    const address = freshAddress();
    await signUp(address);
    await emailsTo(address);
    expect(await isVerified(address)).toBe(false);
    sendEmailMock.mockClear();

    expect((await signIn(address)).status).toBe(403);
    const [mail] = await emailsTo(address);
    await open(linkIn(mail));
    expect((await signIn(address)).status).toBe(200);
  });

  it("a session it already holds keeps working until it ends", async () => {
    const address = freshAddress();
    const res = await verifiedAccount(address);
    const cookie = cookieOf(res);
    await sql`UPDATE auth_users SET email_verified = false WHERE email = ${address}`;
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe(address);
  });
});

describe("a password reset", () => {
  async function resetPassword(address: string) {
    const requested = await post("/request-password-reset", {
      email: address,
      redirectTo: "/reset-password",
    });
    expect(requested.status).toBe(200);
    const mail = await vi.waitFor(() => {
      const found = mailTo(address).find((m) => m.text.includes("reset-password"));
      if (!found) throw new Error("no reset email yet");
      return found;
    });
    const token = mail.text.match(/reset-password\/([^?\s]+)/)?.[1];
    expect(token).toBeTruthy();
    return post("/reset-password", { newPassword: "NewCorrectHorse456!", token });
  }

  it("proves the address: an unverified account is verified by it, and can sign in", async () => {
    const address = freshAddress();
    await signUp(address);
    await emailsTo(address);
    expect(await isVerified(address)).toBe(false);

    expect((await resetPassword(address)).status).toBe(200);
    expect(await isVerified(address)).toBe(true);
    const res = await post("/sign-in/email", { email: address, password: "NewCorrectHorse456!" });
    expect(res.status).toBe(200);
  });

  it("ends every session the account had, so whoever held one is out", async () => {
    const address = freshAddress();
    const held = cookieOf(await verifiedAccount(address));
    expect(await auth.api.getSession({ headers: new Headers({ cookie: held }) })).not.toBeNull();
    await resetPassword(address);
    await sql`DELETE FROM auth_verifications WHERE identifier LIKE 'reset-password:%'`;
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM auth_sessions s
      JOIN auth_users u ON u.id = s.user_id WHERE u.email = ${address}
    `;
    expect(count).toBe(0);
  });
});

describe("accepting an invite", () => {
  /** A session from before this shipped: signed in, then unverified, as the 5 are. */
  async function legacyUnverifiedSession(address: string) {
    const res = await verifiedAccount(address);
    await sql`UPDATE auth_users SET email_verified = false WHERE email = ${address}`;
    request.cookie = cookieOf(res);
    const [row] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${address}`;
    return row.id;
  }

  async function seedInvitee(authId: string, storedAddress: string, invitingOrg = ORG) {
    const profile = randomUUID();
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${profile}, ${authId}, ${OTHER_ORG}, ${storedAddress}, 'Invitee', 'owner')
    `;
    // Its own open workspace, as an owner: access needs the membership (follow-ups from 6e27afc..01a6a8c,
    // part 1).
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${OTHER_ORG}, ${profile}, 'owner', now(), now(), true)
    `;
    const token = `verify-invite-${randomUUID()}`;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token, expires_at, is_active)
      VALUES (${invitingOrg}, ${profile}, 'viewer', ${token}, now() + interval '7 days', false)
    `;
    return { profile, token };
  }

  async function accept(token: string) {
    const { GET } = await import("@/app/api/organizations/[orgId]/members/accept/route");
    const res = await GET(
      new Request(`${BASE}/api/organizations/${ORG}/members/accept?token=${token}`),
      { params: Promise.resolve({ orgId: ORG }) },
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  // Team follow-ups, item 5: the invitee has its own open workspace, so it's offered the choice; opening
  // the emailed token proves the address all the same.
  it("proves the address when the invite went to that exact address: verified, and offered the choice", async () => {
    const address = freshAddress();
    const authId = await legacyUnverifiedSession(address);
    const { token } = await seedInvitee(authId, address);
    const { status, body } = await accept(token);
    expect(status).toBe(200);
    expect(body.choice).toBe(true);
    expect(await isVerified(address)).toBe(true);
  });

  it("the same for a profile still holding the sign-up placeholder: the invite matched the account's address", async () => {
    const address = freshAddress();
    const authId = await legacyUnverifiedSession(address);
    const { token } = await seedInvitee(authId, "pending@sync.local");
    expect((await accept(token)).status).toBe(200);
    expect(await isVerified(address)).toBe(true);
  });

  it("proves nothing when the invite went to another address: asked to verify, not accepted", async () => {
    const address = freshAddress();
    const authId = await legacyUnverifiedSession(address);
    const { token } = await seedInvitee(authId, `someone-else-${RUN}@verification.example.com.au`);
    const { status, body } = await accept(token);
    expect(status).toBe(403);
    expect(body.error).toMatch(/verify your email/);
    expect(await isVerified(address)).toBe(false);
    const [invite] = await sql<{ accepted_at: Date | null }[]>`
      SELECT accepted_at FROM org_members WHERE invitation_token = ${token}
    `;
    expect(invite.accepted_at).toBeNull();
  });

  it("an expired invite proves nothing", async () => {
    const address = freshAddress();
    const authId = await legacyUnverifiedSession(address);
    const { token } = await seedInvitee(authId, address);
    await sql`UPDATE org_members SET expires_at = now() - interval '1 day' WHERE invitation_token = ${token}`;
    // Part 3 (follow-ups from d247ba7..f13411d): the one answer for an unusable token.
    expect((await accept(token)).status).toBe(404);
    expect(await isVerified(address)).toBe(false);
  });

  it("the invite API doesn't hand the token to the inviter: the email is the only way to it", async () => {
    const inviter = freshAddress();
    const inviterRes = await verifiedAccount(inviter);
    const [inviterAccount] = await sql<{ id: string }[]>`
      SELECT id FROM auth_users WHERE email = ${inviter}
    `;
    const inviterProfile = randomUUID();
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${inviterProfile}, ${inviterAccount.id}, ${ORG}, ${inviter}, 'Inviter', 'owner')
    `;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG}, ${inviterProfile}, 'owner', now() + interval '7 days', now(), true)
    `;
    // Inviting needs a free seat. The tests above left pending invites here, and
    // Enterprise has no limit.
    await sql`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${ORG}, ${`cus_${RUN}`}, ${`sub_${RUN}`}, 'price_test', 'enterprise', 'monthly', 'active')
    `;
    const invitee = freshAddress();
    const inviteeAccount = await verifiedAccount(invitee).then(async () => {
      const [row] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${invitee}`;
      return row.id;
    });
    await sql`
      INSERT INTO users (clerk_user_id, organization_id, email, name, role)
      VALUES (${inviteeAccount}, ${OTHER_ORG}, ${invitee}, 'Invitee', 'owner')
    `;

    request.cookie = cookieOf(inviterRes);
    const { POST } = await import("@/app/api/organizations/[orgId]/members/invite/route");
    const res = await POST(
      new Request(`${BASE}/api/organizations/${ORG}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invitee, role: "viewer" }),
      }),
      { params: Promise.resolve({ orgId: ORG }) },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("token");
    expect(body.id).toBeTruthy();
  });
});
