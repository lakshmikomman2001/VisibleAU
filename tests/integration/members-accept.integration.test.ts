/**
 * Task #46 (15th follow-up), Part A -- RED->GREEN for the gaps the 14th
 * follow-up's serviceDb audit documented without fixing:
 * app/api/organizations/[orgId]/members/accept/route.ts had no expiry
 * check and no caller-identity check, so any signed-in user holding a raw
 * invitation_token could activate that membership regardless of who was
 * actually invited, at any time.
 *
 * Only the session boundary (`auth.api.getSession`) is mocked -- `headers`
 * is mocked because Next.js's real one throws outside a request context.
 * `getCurrentUser()`, `withRlsContext`, and `isAuthUserEmailVerified` all
 * run for real against the test DB, so this exercises the actual RLS
 * policy on org_members too, not just the route's own JS checks.
 *
 * org_members has a UNIQUE(organization_id, user_id) index, so each
 * scenario that needs "the actually-invited person" gets its own fresh
 * users/auth_users row rather than sharing one across tests.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

const { GET, POST } = await import("@/app/api/organizations/[orgId]/members/accept/route");

const ORG_ID = randomUUID();
const WRONG_AUTH_ID = `auth-wrong-${randomUUID()}`;
const WRONG_USER_ID = randomUUID();

let client: ReturnType<typeof postgres>;
const createdUserIds: string[] = [];
const createdAuthIds: string[] = [];

function signInAs(authUserId: string) {
  mockGetSession.mockResolvedValue({ user: { id: authUserId, email: `${authUserId}@test.local` } });
}

/** A fresh users/auth_users pair for "the person this invite is actually for". */
async function seedPerson(verified: boolean): Promise<{ userId: string; authId: string }> {
  const userId = randomUUID();
  const authId = `auth-${randomUUID()}`;
  createdUserIds.push(userId);
  createdAuthIds.push(authId);

  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name)
    VALUES (${userId}, ${authId}, ${ORG_ID}, ${`${authId}@test.local`}, 'Test Invitee')
  `;
  await client`
    INSERT INTO auth_users (id, name, email, email_verified)
    VALUES (${authId}, 'Test Invitee', ${`${authId}@test.local`}, ${verified})
  `;
  return { userId, authId };
}

async function seedInvite(opts: {
  userId: string;
  token: string;
  expiresInMs: number;
  acceptedAt?: Date | null;
}) {
  await client`
    INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_at, expires_at, accepted_at, is_active)
    VALUES (
      ${ORG_ID}, ${opts.userId}, 'viewer', ${opts.token}, now(),
      now() + (${opts.expiresInMs}::text || ' milliseconds')::interval,
      ${opts.acceptedAt ?? null}, ${!!opts.acceptedAt}
    )
  `;
}

function callAccept(token: string) {
  return GET(
    new Request(`http://localhost/api/organizations/${ORG_ID}/members/accept?token=${token}`),
    {
      params: Promise.resolve({ orgId: ORG_ID }),
    },
  );
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

beforeAll(async () => {
  client = postgres(getTestDatabaseUrl(), { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, tier, region)
    VALUES (${ORG_ID}, ${`ma-org-${ORG_ID}`}, 'Members-Accept Test Org', 'free', 'au')
  `;
  // Sri, 8 Nov: every acceptance re-checks the seats. These tests aren't about seats
  // (tests/integration/invite-acceptance-rules.integration.test.ts is), so the plan has room.
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;

  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name)
    VALUES (${WRONG_USER_ID}, ${WRONG_AUTH_ID}, ${ORG_ID}, 'wrong@test.local', 'Wrong Person')
  `;
  await client`
    INSERT INTO auth_users (id, name, email, email_verified)
    VALUES (${WRONG_AUTH_ID}, 'Wrong Person', ${`${WRONG_AUTH_ID}@test.local`}, true)
  `;
  createdUserIds.push(WRONG_USER_ID);
  createdAuthIds.push(WRONG_AUTH_ID);
});

// Team follow-ups (31 Oct), item 4: a workspace with seats to spare, for invites sent before an account existed.
const SEATED_ORG_ID = randomUUID();

afterAll(async () => {
  await client`DELETE FROM org_members WHERE organization_id IN (${ORG_ID}, ${SEATED_ORG_ID})`;
  await client`DELETE FROM users WHERE id = ANY(${createdUserIds}) OR organization_id = ${SEATED_ORG_ID}`;
  await client`DELETE FROM auth_users WHERE id = ANY(${createdAuthIds})`;
  await client`DELETE FROM subscriptions WHERE organization_id IN (${ORG_ID}, ${SEATED_ORG_ID})`;
  await client`DELETE FROM organizations WHERE id IN (${ORG_ID}, ${SEATED_ORG_ID})`;
  await client.end();
});

describe("members/accept -- wrong user", () => {
  it("a different signed-in user gets 403, membership stays unaccepted", async () => {
    const { userId } = await seedPerson(true);
    const token = `tok-wrong-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS });
    signInAs(WRONG_AUTH_ID);

    const res = await callAccept(token);
    expect(res.status).toBe(403);

    const [row] =
      await client`SELECT accepted_at FROM org_members WHERE invitation_token = ${token}`;
    expect(row.accepted_at).toBeNull();
  });

  // Team follow-ups (31 Oct), item 2: the page can say who's signed in and who it's for, both masked.
  it("says which account is signed in and who the invite is for, both masked", async () => {
    const { userId } = await seedPerson(true);
    const token = `tok-wrong-named-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS });
    await client`
      UPDATE org_members SET invited_email = 'Lee.Invitee@gmail.example' WHERE invitation_token = ${token}
    `;
    signInAs(WRONG_AUTH_ID);

    const res = await callAccept(token);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: "This invite was sent to a different email address",
      code: "wrong_account",
      signedInAs: "a***@test.local",
      invitedAs: "L***@gmail.example",
    });
    expect(JSON.stringify(body)).not.toMatch(/Lee\.Invitee|auth-wrong/);
  });

  it("an invite sent before addresses were kept names the invited profile's address, masked", async () => {
    const { userId } = await seedPerson(true);
    await client`UPDATE users SET email = 'zed.legacy@legacy.example' WHERE id = ${userId}`;
    const token = `tok-wrong-legacy-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS });
    signInAs(WRONG_AUTH_ID);

    const res = await callAccept(token);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "wrong_account",
      invitedAs: "z***@legacy.example",
    });
  });
});

describe("members/accept -- expired", () => {
  // Part 3 (follow-ups from d247ba7..f13411d): the one answer for an unknown, expired or used token.
  it("an expired invite gets the unusable-invite 404, not activated", async () => {
    const { userId, authId } = await seedPerson(true);
    const token = `tok-expired-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: -1000 });
    signInAs(authId);

    const res = await callAccept(token);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("invite_unusable");

    const [row] =
      await client`SELECT accepted_at FROM org_members WHERE invitation_token = ${token}`;
    expect(row.accepted_at).toBeNull();
  });
});

describe("members/accept -- reused", () => {
  it("an already-accepted invite gets the same 404", async () => {
    const { userId, authId } = await seedPerson(true);
    const token = `tok-reused-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS, acceptedAt: new Date() });
    signInAs(authId);

    const res = await callAccept(token);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("invite_unusable");
  });
});

describe("members/accept -- unverified email", () => {
  // Sent to the account's own address, opening it proves the address instead:
  // tests/integration/email-verification.integration.test.ts.
  it("a signed-in unverified user invited at another address gets 403, not activated", async () => {
    const { userId, authId } = await seedPerson(false);
    await client`UPDATE users SET email = ${`elsewhere-${userId}@test.local`} WHERE id = ${userId}`;
    const token = `tok-unverified-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS });
    signInAs(authId);

    const res = await callAccept(token);
    expect(res.status).toBe(403);

    const [row] =
      await client`SELECT accepted_at FROM org_members WHERE invitation_token = ${token}`;
    expect(row.accepted_at).toBeNull();
  });
});

describe("members/accept -- double-submit race", () => {
  it("only one of two concurrent accepts succeeds; exactly one acceptance is recorded", async () => {
    const { userId, authId } = await seedPerson(true);
    const token = `tok-race-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS });
    signInAs(authId);

    const [resA, resB] = await Promise.all([callAccept(token), callAccept(token)]);
    const statuses = [resA.status, resB.status].sort();
    // Exactly one request wins (200). The loser's exact code depends on
    // timing: if its SELECT runs before the winner's UPDATE commits, it
    // sees the row with accepted_at already set -> 410; if it runs after,
    // the winner has already cleared invitation_token, so the loser's
    // SELECT finds no row at all -> 404 ("Invalid or expired invitation").
    // Both are safe, non-exploitable outcomes -- what actually matters
    // (asserted below) is that exactly one acceptance is ever recorded.
    expect(statuses[0]).toBe(200);
    expect([404, 410]).toContain(statuses[1]);

    const rows = await client`
      SELECT accepted_at FROM org_members WHERE user_id = ${userId} AND organization_id = ${ORG_ID}
    `;
    expect(rows.filter((r) => r.accepted_at !== null).length).toBe(1);
  });
});

describe("members/accept -- happy path", () => {
  it("the actual invited, verified user accepts successfully", async () => {
    const { userId, authId } = await seedPerson(true);
    const token = `tok-happy-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS });
    signInAs(authId);

    const res = await callAccept(token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(true);

    const [row] = await client`
      SELECT accepted_at, is_active, invitation_token FROM org_members WHERE id = ${body.memberId}
    `;
    expect(row.accepted_at).not.toBeNull();
    expect(row.is_active).toBe(true);
    expect(row.invitation_token).toBeNull();
  });
});

// Team follow-ups (31 Oct), item 5: an account with its own open workspace chooses; nothing changes until
// it switches, and switching leaves its own workspace as it is.
describe("members/accept -- an account with its own open workspace", () => {
  const OWN_ORG_ID = randomUUID();
  let profileId = "";
  let authId = "";

  beforeAll(async () => {
    await client`
      INSERT INTO organizations (id, clerk_org_id, name, tier, region)
      VALUES (${OWN_ORG_ID}, ${`ma-own-${OWN_ORG_ID}`}, 'Lee Own Agency', 'free', 'au')
    `;
    authId = `auth-${randomUUID()}`;
    profileId = randomUUID();
    createdAuthIds.push(authId);
    createdUserIds.push(profileId);
    await client`
      INSERT INTO auth_users (id, name, email, email_verified)
      VALUES (${authId}, 'Lee', ${`${authId}@test.local`}, true)
    `;
    await client`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${profileId}, ${authId}, ${OWN_ORG_ID}, ${`${authId}@test.local`}, 'Lee', 'owner')
    `;
    await client`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${OWN_ORG_ID}, ${profileId}, 'owner', now(), now(), true)
    `;
  });

  afterAll(async () => {
    await client`DELETE FROM org_members WHERE organization_id = ${OWN_ORG_ID} OR user_id = ${profileId}`;
    await client`DELETE FROM users WHERE id = ${profileId}`;
    await client`DELETE FROM organizations WHERE id = ${OWN_ORG_ID}`;
  });

  function postAccept(token: string) {
    return POST(
      new Request(`http://localhost/api/organizations/${ORG_ID}/members/accept?token=${token}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ orgId: ORG_ID }) },
    );
  }

  it("opening the invite offers the choice and changes nothing (it used to say 'You've joined the team')", async () => {
    const token = `tok-choice-${randomUUID()}`;
    await seedInvite({ userId: profileId, token, expiresInMs: SEVEN_DAYS_MS });
    signInAs(authId);

    const res = await callAccept(token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      choice: true,
      orgName: "Members-Accept Test Org",
      role: "viewer",
      ownWorkspaceName: "Lee Own Agency",
    });
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(body).not.toHaveProperty("accepted");

    const [row] = await client`
      SELECT accepted_at, is_active, invitation_token FROM org_members WHERE invitation_token = ${token}
    `;
    expect(row).toMatchObject({ accepted_at: null, is_active: false });
    const [profile] = await client`SELECT organization_id, role FROM users WHERE id = ${profileId}`;
    expect(profile).toEqual({ organization_id: OWN_ORG_ID, role: "owner" });
  });

  it("'Switch' accepts and moves it in; its own workspace stays exactly as it was", async () => {
    const [{ invitation_token: token }] = await client`
      SELECT invitation_token FROM org_members WHERE organization_id = ${ORG_ID} AND user_id = ${profileId}
    `;
    signInAs(authId);

    const res = await postAccept(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: true, joined: true });

    const [profile] = await client`SELECT organization_id, role FROM users WHERE id = ${profileId}`;
    expect(profile).toEqual({ organization_id: ORG_ID, role: "viewer" });
    const [row] = await client`
      SELECT accepted_at, is_active, invitation_token FROM org_members WHERE organization_id = ${ORG_ID} AND user_id = ${profileId}
    `;
    expect(row).toMatchObject({ is_active: true, invitation_token: null });
    expect(row.accepted_at).not.toBeNull();
    // Its own workspace: open, and still its to own.
    const [own] = await client`SELECT deleted_at FROM organizations WHERE id = ${OWN_ORG_ID}`;
    expect(own.deleted_at).toBeNull();
    const [owner] = await client`
      SELECT role, is_active FROM org_members WHERE organization_id = ${OWN_ORG_ID} AND user_id = ${profileId}
    `;
    expect(owner).toEqual({ role: "owner", is_active: true });
  });

  it("an account whose profile is already in the inviting workspace is accepted straight away", async () => {
    const { userId, authId: inside } = await seedPerson(true);
    const token = `tok-inside-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS });
    signInAs(inside);
    const res = await callAccept(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: true });
  });
});

// Team follow-ups (31 Oct), item 4: an invite sent to an address before it had an account (no profile yet).
describe("members/accept -- an invite sent before the account existed", () => {
  beforeAll(async () => {
    await client`
      INSERT INTO organizations (id, clerk_org_id, name, tier, region)
      VALUES (${SEATED_ORG_ID}, ${`ma-seated-${SEATED_ORG_ID}`}, 'Seated Test Org', 'free', 'au')
    `;
    await client`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${SEATED_ORG_ID}, ${`cus_${SEATED_ORG_ID}`}, ${`sub_${SEATED_ORG_ID}`}, 'price_test', 'agency_pro', 'monthly', 'active')
    `;
  });

  async function seedAddressInvite(address: string, token: string) {
    await client`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_email, invited_at, expires_at, is_active)
      VALUES (${SEATED_ORG_ID}, NULL, 'analyst', ${token}, ${address}, now(), now() + interval '7 days', false)
    `;
  }

  function acceptSeated(token: string) {
    return GET(
      new Request(
        `http://localhost/api/organizations/${SEATED_ORG_ID}/members/accept?token=${token}`,
      ),
      { params: Promise.resolve({ orgId: SEATED_ORG_ID }) },
    );
  }

  it("the account with that address, which made no workspace, joins with the invited role", async () => {
    const authId = `auth-${randomUUID()}`;
    createdAuthIds.push(authId);
    await client`
      INSERT INTO auth_users (id, name, email, email_verified)
      VALUES (${authId}, 'Signed Up Elsewhere', ${`${authId}@test.local`}, true)
    `;
    const token = `tok-claim-${randomUUID()}`;
    // Typed differently by the inviter: still the same address.
    await seedAddressInvite(` ${authId.toUpperCase()}@TEST.LOCAL `, token);
    signInAs(authId);

    const res = await acceptSeated(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: true, joined: true });

    const [profile] = await client`
      SELECT id, organization_id, role FROM users WHERE clerk_user_id = ${authId}
    `;
    expect(profile).toMatchObject({ organization_id: SEATED_ORG_ID, role: "analyst" });
    const [row] = await client`
      SELECT user_id, accepted_at, is_active, invitation_token FROM org_members WHERE organization_id = ${SEATED_ORG_ID} AND user_id = ${profile.id}
    `;
    expect(row).toMatchObject({ is_active: true, invitation_token: null });
    expect(row.accepted_at).not.toBeNull();
  });

  it("another address is the wrong account: masked, and nothing changes", async () => {
    const token = `tok-claim-wrong-${randomUUID()}`;
    await seedAddressInvite("Lee.Newcomer@claim.example", token);
    signInAs(WRONG_AUTH_ID);

    const res = await acceptSeated(token);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "wrong_account",
      invitedAs: "L***@claim.example",
    });
    const [row] = await client`
      SELECT user_id, accepted_at FROM org_members WHERE invitation_token = ${token}
    `;
    expect(row).toEqual({ user_id: null, accepted_at: null });
  });
});
