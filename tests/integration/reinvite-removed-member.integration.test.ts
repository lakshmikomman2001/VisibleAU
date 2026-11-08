/**
 * Live invite test follow-ups (8 Nov), part 5 (Sri: re-inviting a removed member must work) -- removing
 * someone deactivates their accepted membership and keeps their profile (history names it). Inviting the
 * address again answered 409 "Member already exists": that old row blocked it. Now it becomes a fresh pending
 * invite -- a new token's hash, the new role and expiry, not accepted, inactive -- with the seat check;
 * accepting makes it active again in the new role, and their history keeps its author. An active member is
 * still refused.
 *
 * Real routes and better-auth against the test database; the signed-in owner (getCurrentUser), the email
 * send and next/headers (the invitee's real session cookie) stand in.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
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
const ORG_ID = randomUUID();
const OWNER_ID = randomUUID();
const PASSWORD = "CorrectHorse123!";
const address = (label: string) => `${label}-${RUN}@reinvite.example.com.au`;

let sql: ReturnType<typeof postgres>;

interface Member {
  email: string;
  authId: string;
  profileId: string;
  memberId: string;
  cookie: string;
}

/** A real account, signed in, with its profile here and an accepted membership in `role`. */
async function member(label: string, role: string): Promise<Member> {
  const email = address(label);
  const { auth } = await import("@/lib/auth/server");
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  const [{ id: authId }] = await sql<
    { id: string }[]
  >`SELECT id FROM auth_users WHERE email = ${email}`;
  await sql`UPDATE auth_users SET email_verified = true WHERE id = ${authId}`;
  const profileId = randomUUID();
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${profileId}, ${authId}, ${ORG_ID}, ${email}, ${label}, ${role})
  `;
  const [{ id: memberId }] = await sql<{ id: string }[]>`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${profileId}, ${role}, now(), now(), true)
    RETURNING id
  `;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { email, authId, profileId, memberId, cookie };
}

async function invite(email: string, role: string) {
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

async function remove(memberId: string) {
  const { DELETE } = await import("@/app/api/organizations/[orgId]/members/[memberId]/route");
  const res = await DELETE(new Request(`${BASE}/x`, { method: "DELETE" }), {
    params: Promise.resolve({ orgId: ORG_ID, memberId }),
  });
  return res.status;
}

/** The invite page's acceptance, as the removed member: no workspace now, so getCurrentUser is null. */
async function accept(token: string, cookie: string) {
  request.cookie = cookie;
  currentUserMock.mockResolvedValueOnce(null);
  const { GET } = await import("@/app/api/organizations/[orgId]/members/accept/route");
  const res = await GET(
    new Request(`${BASE}/api/organizations/${ORG_ID}/members/accept?token=${token}`),
    { params: Promise.resolve({ orgId: ORG_ID }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function membership(memberId: string) {
  const [row] = await sql<
    {
      user_id: string;
      role: string;
      is_active: boolean;
      accepted: boolean;
      invitation_token_hash: string | null;
    }[]
  >`
    SELECT user_id, role, is_active, accepted_at IS NOT NULL AS accepted, invitation_token_hash
    FROM org_members WHERE id = ${memberId}
  `;
  return row;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.vunnara.com.au";
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`reinvite-${ORG_ID}`}, 'Reinvite Agency', ${`reinvite-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER_ID}, ${`reinvite-${OWNER_ID}`}, ${ORG_ID}, ${address("owner")}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${OWNER_ID}, 'owner', now(), now(), true)
  `;
}, 60_000);

beforeEach(() => {
  sendEmailMock.mockReset().mockResolvedValue({ ok: true, id: "email-test" });
  // Reset first: an acceptance a test queued (mockResolvedValueOnce) never leaks into the next one.
  currentUserMock.mockReset().mockResolvedValue({
    id: OWNER_ID,
    organizationId: ORG_ID,
    email: address("owner"),
    name: "Owner",
    role: "owner",
    organization: { id: ORG_ID, name: "Reinvite Agency" },
  });
});

afterAll(async () => {
  const accounts = await sql<{ id: string }[]>`
    SELECT id FROM auth_users WHERE email LIKE ${`%-${RUN}@reinvite.example.com.au`}
  `;
  const ids = accounts.map((a) => a.id);
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${ids})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'team-invite:%'`;
  await sql.end();
});

describe("re-inviting someone removed from the team", () => {
  let lee: Member;
  let token = "";

  beforeAll(async () => {
    lee = await member("lee", "analyst");
    // Something Lee did, before being removed.
    await sql`
      INSERT INTO audit_trail (organization_id, user_id, action, resource_type, metadata)
      VALUES (${ORG_ID}, ${lee.profileId}, 'brand_updated', 'brand', '{}'::jsonb)
    `;
  });

  it("removed, then invited again: the same row, a fresh pending invite with the new role", async () => {
    expect(await remove(lee.memberId)).toBe(200);
    expect(await membership(lee.memberId)).toMatchObject({ is_active: false, accepted: true });

    const { status, body } = await invite(lee.email, "viewer");
    expect(status).toBe(201);
    expect(body).toMatchObject({ id: lee.memberId, resent: false, emailSent: true });
    token = inviteTokenFromEmail(sendEmailMock, lee.email, ORG_ID);
    expect(await membership(lee.memberId)).toEqual({
      user_id: lee.profileId,
      role: "viewer",
      is_active: false,
      accepted: false,
      invitation_token_hash: hashInviteToken(token),
    });
  });

  it("accepting makes it active again, as a viewer, and their history keeps its author", async () => {
    expect(await accept(token, lee.cookie)).toMatchObject({
      status: 200,
      body: { accepted: true, memberId: lee.memberId },
    });
    expect(await membership(lee.memberId)).toEqual({
      user_id: lee.profileId,
      role: "viewer",
      is_active: true,
      accepted: true,
      invitation_token_hash: null,
    });
    const [{ authored }] = await sql<{ authored: number }[]>`
      SELECT count(*)::int AS authored FROM audit_trail
      WHERE organization_id = ${ORG_ID} AND user_id = ${lee.profileId} AND action = 'brand_updated'
    `;
    expect(authored).toBe(1);
    // The same profile, still here.
    const [profile] = await sql<{ organization_id: string }[]>`
      SELECT organization_id FROM users WHERE id = ${lee.profileId}
    `;
    expect(profile.organization_id).toBe(ORG_ID);
  });

  it("an active member still can't be invited again: 409", async () => {
    const kim = await member("kim", "analyst");
    expect(await invite(kim.email, "admin")).toEqual({
      status: 409,
      body: { error: "Member already exists" },
    });
    expect(await membership(kim.memberId)).toMatchObject({ role: "analyst", is_active: true });
  });

  it("with no free seat, a removed member isn't re-invited", async () => {
    const sam = await member("sam", "analyst");
    expect(await remove(sam.memberId)).toBe(200);
    // The plan shrinks to one seat, which the owner fills.
    await sql`UPDATE subscriptions SET tier = 'growth' WHERE organization_id = ${ORG_ID}`;
    try {
      // The seat check's answer, not "Member already exists".
      expect(await invite(sam.email, "viewer")).toEqual({
        status: 409,
        body: { error: "Your plan includes 1 seat" },
      });
      expect(await membership(sam.memberId)).toMatchObject({ is_active: false, accepted: true });
    } finally {
      await sql`UPDATE subscriptions SET tier = 'agency_pro' WHERE organization_id = ${ORG_ID}`;
    }
  });
});
