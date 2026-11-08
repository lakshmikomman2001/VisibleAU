/**
 * Follow-ups from 6e27afc..01a6a8c, part 3 (Sri, 8 Nov: protect the last owner) -- a workspace keeps at
 * least one owner who can manage it. Demoting, removing or deactivating its last one -- by themselves
 * included -- is refused, "A workspace needs at least one owner. Make someone else owner first.", with
 * nothing changed. Two owners demoting each other at once: one wins. And an only owner with a pending
 * invite can't switch away until it's cancelled. Real routes against the test database; only the signed-in
 * user is stubbed.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { currentUserMock } = vi.hoisted(() => ({ currentUserMock: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));

const RUN = randomUUID().slice(0, 8);
const BASE = "http://localhost:3000";
const LAST_OWNER = "A workspace needs at least one owner. Make someone else owner first.";

let sql: ReturnType<typeof postgres>;
const orgs: string[] = [];

interface Member {
  profileId: string;
  memberId: string;
  orgId: string;
  orgName: string;
}

async function makeOrg(name: string, tier?: string): Promise<string> {
  const id = randomUUID();
  orgs.push(id);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${id}, ${`last-owner-${id}`}, ${name}, ${`last-owner-${id}`})
  `;
  if (tier) {
    await sql`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${id}, ${`cus_${id}`}, ${`sub_${id}`}, 'price_test', ${tier}, 'monthly', 'active')
    `;
  }
  return id;
}

async function makeMember(orgId: string, orgName: string, role: string): Promise<Member> {
  const profileId = randomUUID();
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${profileId}, ${`last-owner-${profileId}`}, ${orgId}, ${`${role}-${profileId.slice(0, 8)}@last-owner.example.com.au`}, ${role}, ${role})
  `;
  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${orgId}, ${profileId}, ${role}, now(), now(), true)
    RETURNING id
  `;
  return { profileId, memberId: id, orgId, orgName };
}

function signedInAs(m: Member) {
  return {
    id: m.profileId,
    organizationId: m.orgId,
    email: "someone@last-owner.example.com.au",
    name: "Someone",
    role: "member",
    organization: { id: m.orgId, name: m.orgName },
  };
}

async function memberRoute(
  actor: Member,
  method: "PATCH" | "DELETE",
  targetMemberId: string,
  body?: unknown,
) {
  currentUserMock.mockResolvedValueOnce(signedInAs(actor));
  const mod = await import("@/app/api/organizations/[orgId]/members/[memberId]/route");
  const res = await mod[method](
    new Request(`${BASE}/api/organizations/${actor.orgId}/members/${targetMemberId}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ orgId: actor.orgId, memberId: targetMemberId }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Waits until `n` requests are queued for a workspace's row (lib/governance/owners.ts lockWorkspace). */
async function waitForRequestsHoldingOn(n: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const [{ waiting }] = await sql<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%from "organizations"%for update%'
    `;
    if (waiting >= n) return;
    if (Date.now() > deadline) {
      throw new Error(`${waiting} of ${n} requests waited for the workspace's row before deciding`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function membership(memberId: string) {
  const [row] = await sql<{ role: string; is_active: boolean }[]>`
    SELECT role, is_active FROM org_members WHERE id = ${memberId}
  `;
  return row;
}

beforeAll(() => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
});

afterAll(async () => {
  await sql`DELETE FROM audit_trail WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM users WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
});

describe("the last owner can't be demoted or removed", () => {
  let owner: Member;
  let admin: Member;
  beforeAll(async () => {
    const org = await makeOrg(`One Owner ${RUN}`);
    owner = await makeMember(org, `One Owner ${RUN}`, "owner");
    admin = await makeMember(org, `One Owner ${RUN}`, "admin");
  });

  it("demoting themselves: refused, and they're still the owner", async () => {
    const { status, body } = await memberRoute(owner, "PATCH", owner.memberId, { role: "admin" });
    expect(status).toBe(409);
    expect(body.error).toBe(LAST_OWNER);
    expect(await membership(owner.memberId)).toEqual({ role: "owner", is_active: true });
  });

  it("removing themselves: refused, and still active", async () => {
    const { status, body } = await memberRoute(owner, "DELETE", owner.memberId);
    expect(status).toBe(409);
    expect(body.error).toBe(LAST_OWNER);
    expect(await membership(owner.memberId)).toEqual({ role: "owner", is_active: true });
  });

  it("their brand access can still change: only removing the owner is refused", async () => {
    const { status } = await memberRoute(owner, "PATCH", owner.memberId, { brandAccess: null });
    expect(status).toBe(200);
  });

  it("an admin can't touch the owner at all (as before)", async () => {
    expect((await memberRoute(admin, "PATCH", owner.memberId, { role: "viewer" })).status).toBe(
      403,
    );
  });
});

describe("with two owners", () => {
  it("one can demote the other; then the one left is the last, and can't demote themselves", async () => {
    const org = await makeOrg(`Two Owners ${RUN}`);
    const first = await makeMember(org, `Two Owners ${RUN}`, "owner");
    const second = await makeMember(org, `Two Owners ${RUN}`, "owner");
    const demoted = await memberRoute(first, "PATCH", second.memberId, { role: "admin" });
    expect(demoted.status).toBe(200);
    expect(await membership(second.memberId)).toEqual({ role: "admin", is_active: true });
    expect((await memberRoute(first, "PATCH", first.memberId, { role: "admin" })).status).toBe(409);
  });

  it("demoting each other at the same moment: exactly one wins, and an owner is left", async () => {
    const org = await makeOrg(`Race Owners ${RUN}`);
    const a = await makeMember(org, `Race Owners ${RUN}`, "owner");
    const b = await makeMember(org, `Race Owners ${RUN}`, "owner");
    // The worst moment: both requests are past their own role check (both owners) before either
    // decides. Holding the workspace's row from here makes that happen every time -- each request must
    // then wait for the row before it checks who'd be left, so they decide one after the other.
    const holder = postgres(getTestDatabaseUrl(), { max: 1 });
    let both: Promise<Array<{ status: number }>> | undefined;
    try {
      await holder.begin(async (tx) => {
        await tx`SELECT id FROM organizations WHERE id = ${org} FOR UPDATE`;
        both = Promise.all([
          memberRoute(a, "PATCH", b.memberId, { role: "admin" }),
          memberRoute(b, "PATCH", a.memberId, { role: "admin" }),
        ]);
        await waitForRequestsHoldingOn(2);
      });
    } finally {
      await holder.end();
    }
    const results = await (both ?? Promise.reject(new Error("requests never started")));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const roles = [await membership(a.memberId), await membership(b.memberId)].map((m) => m.role);
    expect(roles.filter((r) => r === "owner")).toHaveLength(1);
  });
});

describe("decision 9: a pending invite is someone on their way in", () => {
  it("the only owner with a pending invite can't switch away; once it's cancelled, they can", async () => {
    const ownName = `Pending Own ${RUN}`;
    const own = await makeOrg(ownName);
    const lee = await makeMember(own, ownName, "owner");
    const [{ id: pendingId }] = await sql<{ id: string }[]>`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_email, invited_at, expires_at, is_active)
      VALUES (${own}, NULL, 'viewer', ${`pending-${RUN}`}, ${`newcomer-${RUN}@last-owner.example.com.au`}, now(), now() + interval '7 days', false)
      RETURNING id
    `;
    const inviting = await makeOrg(`Inviting ${RUN}`, "agency_pro");
    await makeMember(inviting, `Inviting ${RUN}`, "owner");
    const [{ id: inviteId }] = await sql<{ id: string }[]>`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_at, expires_at, is_active)
      VALUES (${inviting}, ${lee.profileId}, 'analyst', ${`switch-${RUN}`}, now(), now() + interval '7 days', false)
      RETURNING id
    `;
    const { joinWorkspaceByInvite } = await import("@/lib/auth/invite");
    const join = () =>
      joinWorkspaceByInvite({
        memberId: inviteId,
        organizationId: inviting,
        profileId: lee.profileId,
        email: "lee@last-owner.example.com.au",
        leaveOpenWorkspace: true,
      });

    expect(await join()).toEqual({
      ok: false,
      refusal: {
        status: 409,
        code: "only_owner",
        error: `You're the only owner of ${ownName}. Cancel the pending invites or make someone else owner first.`,
      },
    });

    expect((await memberRoute(lee, "DELETE", pendingId)).status).toBe(200);
    expect(await join()).toEqual({ ok: true, outcome: "joined" });
  });

  it("an expired invite isn't anyone: the empty free workspace can be left", async () => {
    const ownName = `Expired Own ${RUN}`;
    const own = await makeOrg(ownName);
    const kim = await makeMember(own, ownName, "owner");
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_email, invited_at, expires_at, is_active)
      VALUES (${own}, NULL, 'viewer', ${`expired-${RUN}`}, ${`late-${RUN}@last-owner.example.com.au`}, now() - interval '8 days', now() - interval '1 day', false)
    `;
    const inviting = await makeOrg(`Inviting Two ${RUN}`, "agency_pro");
    await makeMember(inviting, `Inviting Two ${RUN}`, "owner");
    const [{ id: inviteId }] = await sql<{ id: string }[]>`
      INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_at, expires_at, is_active)
      VALUES (${inviting}, ${kim.profileId}, 'analyst', ${`switch-two-${RUN}`}, now(), now() + interval '7 days', false)
      RETURNING id
    `;
    const { joinWorkspaceByInvite } = await import("@/lib/auth/invite");
    expect(
      await joinWorkspaceByInvite({
        memberId: inviteId,
        organizationId: inviting,
        profileId: kim.profileId,
        email: "kim@last-owner.example.com.au",
        leaveOpenWorkspace: true,
      }),
    ).toEqual({ ok: true, outcome: "joined" });
  });
});
