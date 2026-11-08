/**
 * Follow-ups from 6e27afc..01a6a8c, part 4 (Sri, 8 Nov: store invite token hashes; migration 0134) -- an
 * invite's token is stored only as its SHA-256 hash; the token itself exists only in the emailed link. Real
 * routes and better-auth against the test database (with 0134 applied); only the inviter's session, the
 * email send and next/headers (carrying the invitee's real session cookie) stand in, and the token is read
 * where a person would find it: in the email.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const ORG_ID = randomUUID();
const OWNER_ID = randomUUID();
const PASSWORD = "CorrectHorse123!";
const address = (label: string) => `${label}-${RUN}@token-hash.example.com.au`;
const freshIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

let sql: ReturnType<typeof postgres>;
const closedWorkspaces: string[] = [];

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
  return inviteTokenFromEmail(sendEmailMock, email, ORG_ID);
}

async function preview(token: string) {
  const { GET } = await import("@/app/api/invites/[orgId]/[token]/route");
  const res = await GET(
    new Request(`${BASE}/api/invites/${ORG_ID}/${token}`, {
      headers: { "x-forwarded-for": freshIp() },
    }),
    { params: Promise.resolve({ orgId: ORG_ID, token }) },
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

async function inviteRow(email: string) {
  const [row] = await sql<
    { id: string; invitation_token: string | null; invitation_token_hash: string | null }[]
  >`
    SELECT id, invitation_token, invitation_token_hash FROM org_members
    WHERE organization_id = ${ORG_ID} AND lower(invited_email) = lower(${email})
  `;
  return row;
}

/** Migration 0134's own formula, as run2 used it on the tokens it found. */
async function sqlHash(token: string): Promise<string> {
  const [{ hash }] = await sql<{ hash: string }[]>`
    SELECT encode(sha256(convert_to(${token}::text, 'UTF8')), 'hex') AS hash
  `;
  return hash;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.vunnara.com.au";
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`token-hash-${ORG_ID}`}, 'Token Hash Agency', ${`token-hash-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER_ID}, ${`token-hash-${OWNER_ID}`}, ${ORG_ID}, ${address("owner")}, 'Owner', 'owner')
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
  currentUserMock.mockResolvedValue({
    id: OWNER_ID,
    organizationId: ORG_ID,
    email: address("owner"),
    name: "Owner",
    role: "owner",
    organization: { id: ORG_ID, name: "Token Hash Agency" },
  });
});

afterAll(async () => {
  const made = await sql<{ id: string }[]>`
    SELECT clerk_user_id AS id FROM users
    WHERE (organization_id = ${ORG_ID} AND id <> ${OWNER_ID}) OR organization_id = ANY(${closedWorkspaces})
  `;
  const ids = made.map((r) => r.id);
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID} OR organization_id = ANY(${closedWorkspaces})`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${ids})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID} OR id = ANY(${closedWorkspaces})`;
  await sql.end();
});

describe("a new invite", () => {
  it("stores only the hash of its token; the token is in the email and nowhere else", async () => {
    const email = address("new");
    const token = await invite(email);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { hashInviteToken } = await import("@/lib/auth/invite-token");
    const row = await inviteRow(email);
    expect(row.invitation_token).toBeNull();
    expect(row.invitation_token_hash).toBe(hashInviteToken(token));
    expect(row.invitation_token_hash).toBe(await sqlHash(token));
  });

  it("its emailed link works: the preview, then the sign-up; then the hash is gone", async () => {
    const email = address("emailed");
    const token = await invite(email);
    expect((await preview(token)).status).toBe(200);
    expect((await signUp(token, "Emailed Link")).status).toBe(201);
    const row = await inviteRow(email);
    expect(row).toMatchObject({ invitation_token: null, invitation_token_hash: null });
  });

  it("a wrong token is refused, with the one answer", async () => {
    await invite(address("wrong"));
    expect(await preview(`not-the-token-${randomUUID()}`)).toMatchObject({
      status: 404,
      body: { code: "invite_unusable" },
    });
  });
});

describe("an invite to an account that already exists", () => {
  it("its emailed link is accepted by that account, signed in; then the hash is gone", async () => {
    const email = address("existing");
    const { auth } = await import("@/lib/auth/server");
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Existing" } });
    const [{ id: authId }] = await sql<{ id: string }[]>`
      SELECT id FROM auth_users WHERE email = ${email}
    `;
    await sql`UPDATE auth_users SET email_verified = true WHERE id = ${authId}`;
    // Its own workspace is closed, so accepting joins this one at once (no "Switch" choice).
    const own = randomUUID();
    closedWorkspaces.push(own);
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug, deleted_at)
      VALUES (${own}, ${`token-hash-own-${own}`}, 'Closed Own', ${`token-hash-own-${own}`}, now())
    `;
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${randomUUID()}, ${authId}, ${own}, ${email}, 'Existing', 'owner')
    `;

    const token = await invite(email);
    const { hashInviteToken } = await import("@/lib/auth/invite-token");
    expect(await inviteRow(email)).toMatchObject({
      invitation_token: null,
      invitation_token_hash: hashInviteToken(token),
    });

    const signedIn = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    });
    request.cookie = signedIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    // No open workspace of its own: what getCurrentUser answers for it.
    currentUserMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/organizations/[orgId]/members/accept/route");
    const res = await GET(
      new Request(`${BASE}/api/organizations/${ORG_ID}/members/accept?token=${token}`),
      { params: Promise.resolve({ orgId: ORG_ID }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: true, joined: true });
    expect(await inviteRow(email)).toMatchObject({
      invitation_token: null,
      invitation_token_hash: null,
    });
  });
});

describe("an invite sent before this push (a plain token), hashed by the migration", () => {
  it.each([
    ["old 21 characters", "V1StGXR8_Z5jdHi6B-myT"],
    ["newer 43 characters", "b6ZcTqT2mKpsrPX0nE4w1Hn8dVxYk3QjGc7uA5LfR9s"],
  ])("%s: run2's formula finds it, and its link still works", async (_label, plain) => {
    const email = address(`legacy-${plain.length}`);
    const token = `${plain.slice(0, -4)}${RUN.slice(0, 4)}`;
    // As the code before this push wrote it: the plain token. (The trigger hashes it at once; clearing the
    // hash puts the row as it was before run2, which the migration's UPDATE then fills.)
    const [{ id }] = await sql<{ id: string }[]>`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_email, invited_at, expires_at, is_active)
      VALUES (${ORG_ID}, NULL, 'viewer', ${token}, ${email}, now(), now() + interval '7 days', false)
      RETURNING id
    `;
    await sql`UPDATE org_members SET invitation_token_hash = NULL WHERE id = ${id}`;
    const migration = readFileSync(
      join(__dirname, "../../db/migrations/0134_invite_token_hash.sql"),
      "utf8",
    );
    const backfill = migration.match(
      /UPDATE org_members\s+SET invitation_token_hash[\s\S]*?;/,
    )?.[0];
    expect(backfill).toBeDefined();
    await sql.unsafe(backfill ?? "");
    expect((await inviteRow(email)).invitation_token_hash).toBe(await sqlHash(token));

    expect((await preview(token)).status).toBe(200);
    expect((await signUp(token, `Legacy ${plain.length}`)).status).toBe(201);
  });

  it("one the old code writes after run2 (before the push) gets its hash from the trigger", async () => {
    const email = address("between");
    const token = `between-run2-and-push-${RUN}`;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_email, invited_at, expires_at, is_active)
      VALUES (${ORG_ID}, NULL, 'viewer', ${token}, ${email}, now(), now() + interval '7 days', false)
    `;
    const { hashInviteToken } = await import("@/lib/auth/invite-token");
    expect((await inviteRow(email)).invitation_token_hash).toBe(hashInviteToken(token));
    expect((await preview(token)).status).toBe(200);
  });
});
