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

const { GET } = await import("@/app/api/organizations/[orgId]/members/accept/route");

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

afterAll(async () => {
  await client`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM users WHERE id = ANY(${createdUserIds})`;
  await client`DELETE FROM auth_users WHERE id = ANY(${createdAuthIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
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
});

describe("members/accept -- expired", () => {
  it("an expired invite gets 410, not activated", async () => {
    const { userId, authId } = await seedPerson(true);
    const token = `tok-expired-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: -1000 });
    signInAs(authId);

    const res = await callAccept(token);
    expect(res.status).toBe(410);

    const [row] =
      await client`SELECT accepted_at FROM org_members WHERE invitation_token = ${token}`;
    expect(row.accepted_at).toBeNull();
  });
});

describe("members/accept -- reused", () => {
  it("an already-accepted invite gets 410", async () => {
    const { userId, authId } = await seedPerson(true);
    const token = `tok-reused-${randomUUID()}`;
    await seedInvite({ userId, token, expiresInMs: SEVEN_DAYS_MS, acceptedAt: new Date() });
    signInAs(authId);

    const res = await callAccept(token);
    expect(res.status).toBe(410);
  });
});

describe("members/accept -- unverified email", () => {
  it("a signed-in but unverified invited user gets 403, not activated", async () => {
    const { userId, authId } = await seedPerson(false);
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
