/**
 * Follow-ups from d247ba7..f13411d, part 1 -- Sri's decisions (8 Nov) about accepting an invite, against the
 * test database. Only the session is stubbed (`auth.api.getSession`; `headers` because Next's real one
 * throws outside a request); getCurrentUser, the RLS reads and every write run for real.
 * - 7: every acceptance re-checks the seats -- signing up through the invite, an account claiming one sent
 *   before it existed, "Switch to <org>", joining with no workspace, accepting where the profile already is
 *   -- and refuses with nothing made or moved. Two acceptances racing for the last seat: exactly one wins.
 * - 8: no workspace email until the invite is accepted: a pending ("Not now") invitee gets none, and the
 *   same person gets them once they've switched in. A profile in the workspace whose membership is pending
 *   or removed gets none, whatever its users.role says.
 * - 9: a workspace's only owner can't switch away while it has a subscription that isn't cancelled, other
 *   people or schedules; an empty free workspace, or one with another owner, can be left.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
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

const RUN = randomUUID().slice(0, 8);
const NO_SEAT = "This workspace has no free seats. Ask the owner to add a seat.";
const SEVEN_DAYS = "7 days";

let sql: ReturnType<typeof postgres>;
const orgs: string[] = [];
const profiles: string[] = [];
const accounts: string[] = [];

async function makeOrg(
  name: string,
  opts: { tier?: string; status?: string; closed?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  orgs.push(id);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, deleted_at)
    VALUES (${id}, ${`accept-rules-${id}`}, ${name}, ${`accept-rules-${id}`}, ${opts.closed ? new Date() : null})
  `;
  if (opts.tier) {
    await sql`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${id}, ${`cus_${id}`}, ${`sub_${id}`}, 'price_test', ${opts.tier}, 'monthly', ${opts.status ?? "active"})
    `;
  }
  return id;
}

interface Person {
  profileId: string;
  authId: string;
  email: string;
}

/** An account and its profile in `home`, with a membership there (accepted and active) unless `role` is null. */
async function makePerson(
  label: string,
  home: string,
  role: string | null = "owner",
  profileRole = role ?? "member",
): Promise<Person> {
  const profileId = randomUUID();
  const authId = `accept-rules-${randomUUID()}`;
  const email = `${label}-${RUN}@accept-rules.example.com.au`;
  profiles.push(profileId);
  accounts.push(authId);
  await sql`
    INSERT INTO auth_users (id, name, email, email_verified) VALUES (${authId}, ${label}, ${email}, true)
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${profileId}, ${authId}, ${home}, ${email}, ${label}, ${profileRole})
  `;
  if (role) {
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${home}, ${profileId}, ${role}, now(), now(), true)
    `;
  }
  return { profileId, authId, email };
}

/** A pending invite to `org`: for a profile, or (profileId null) for an address with no account yet. */
async function invite(
  org: string,
  profileId: string | null,
  role = "analyst",
  address: string | null = null,
): Promise<{ id: string; token: string }> {
  const token = `accept-rules-${randomUUID()}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO org_members (organization_id, user_id, role, invitation_token, invited_email, invited_at, expires_at, is_active)
    VALUES (${org}, ${profileId}, ${role}, ${token}, ${address}, now(), now() + ${SEVEN_DAYS}::interval, false)
    RETURNING id
  `;
  return { id: row.id, token };
}

function signInAs(person: { authId: string; email: string }) {
  mockGetSession.mockResolvedValue({
    user: { id: person.authId, email: person.email, name: "Test" },
  });
}

async function accept(org: string, token: string, method: "GET" | "POST") {
  const { GET, POST } = await import("@/app/api/organizations/[orgId]/members/accept/route");
  const res = await (method === "GET" ? GET : POST)(
    new Request(`http://localhost/api/organizations/${org}/members/accept?token=${token}`, {
      method,
    }),
    { params: Promise.resolve({ orgId: org }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function where(profileId: string): Promise<string> {
  const [row] = await sql<{ organization_id: string }[]>`
    SELECT organization_id FROM users WHERE id = ${profileId}
  `;
  return row.organization_id;
}

async function inviteState(id: string) {
  const [row] = await sql<{ accepted_at: Date | null; is_active: boolean }[]>`
    SELECT accepted_at, is_active FROM org_members WHERE id = ${id}
  `;
  return row;
}

async function activeMembers(org: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM org_members WHERE organization_id = ${org} AND is_active
  `;
  return n;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
}, 60000);

afterAll(async () => {
  await sql`DELETE FROM audit_schedules WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM report_delivery_schedules WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brands WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  const madeBySignUp = await sql<{ id: string }[]>`
    SELECT clerk_user_id AS id FROM users WHERE organization_id = ANY(${orgs}) AND NOT (id = ANY(${profiles}))
  `;
  const allAccounts = [...accounts, ...madeBySignUp.map((r) => r.id)];
  await sql`DELETE FROM users WHERE organization_id = ANY(${orgs}) OR id = ANY(${profiles})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${allAccounts})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${allAccounts})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
});

describe("decision 7: every acceptance re-checks the seats", () => {
  // A free workspace: one seat, which its owner fills -- as when a plan shrinks after invites went out.
  let full = "";
  beforeAll(async () => {
    full = await makeOrg("Full Agency");
    await makePerson("full-owner", full);
  });

  it("'Switch to <org>' with no free seat: refused, and nothing moved", async () => {
    const own = await makeOrg("Lee Own Agency");
    const lee = await makePerson("lee", own);
    const { id, token } = await invite(full, lee.profileId);
    signInAs(lee);
    const { status, body } = await accept(full, token, "POST");
    expect(status).toBe(409);
    expect(body).toMatchObject({ error: NO_SEAT, code: "no_seat" });
    expect(await where(lee.profileId)).toBe(own);
    expect(await inviteState(id)).toEqual({ accepted_at: null, is_active: false });
  });

  it("joining with no workspace of its own (it was closed), no free seat: refused, nothing moved", async () => {
    const closed = await makeOrg("Closed Agency", { closed: true });
    const kim = await makePerson("kim", closed);
    const { id, token } = await invite(full, kim.profileId);
    signInAs(kim);
    const { status, body } = await accept(full, token, "GET");
    expect(status).toBe(409);
    expect(body.error).toBe(NO_SEAT);
    expect(await where(kim.profileId)).toBe(closed);
    expect(await inviteState(id)).toEqual({ accepted_at: null, is_active: false });
  });

  it("accepting where the profile already is, no free seat: refused, not accepted", async () => {
    const ash = await makePerson("ash", full, null);
    const { id, token } = await invite(full, ash.profileId);
    signInAs(ash);
    const { status, body } = await accept(full, token, "GET");
    expect(status).toBe(409);
    expect(body.error).toBe(NO_SEAT);
    expect(await inviteState(id)).toEqual({ accepted_at: null, is_active: false });
  });

  it("an account claiming an invite sent before it existed, no free seat: refused, no profile made", async () => {
    const authId = `accept-rules-${randomUUID()}`;
    const email = `sam-${RUN}@accept-rules.example.com.au`;
    accounts.push(authId);
    await sql`INSERT INTO auth_users (id, name, email, email_verified) VALUES (${authId}, 'Sam', ${email}, true)`;
    const { id, token } = await invite(full, null, "analyst", email);
    signInAs({ authId, email });
    const { status, body } = await accept(full, token, "GET");
    expect(status).toBe(409);
    expect(body.error).toBe(NO_SEAT);
    expect(await sql`SELECT id FROM users WHERE clerk_user_id = ${authId}`).toHaveLength(0);
    expect(await inviteState(id)).toEqual({ accepted_at: null, is_active: false });
  });

  it("signing up through an invite to a new address, no free seat: refused, no account made", async () => {
    const email = `new-${RUN}@accept-rules.example.com.au`;
    const { id, token } = await invite(full, null, "viewer", email);
    const { signUpByInvite } = await import("@/lib/auth/invite");
    const result = await signUpByInvite({
      organizationId: full,
      token,
      name: "New Person",
      email,
      passwordHash: "not-a-real-hash",
    });
    expect(result).toEqual({
      ok: false,
      refusal: { status: 409, code: "no_seat", error: NO_SEAT },
    });
    expect(await sql`SELECT id FROM auth_users WHERE email = ${email}`).toHaveLength(0);
    expect(await inviteState(id)).toEqual({ accepted_at: null, is_active: false });
  });

  it("two switches racing for the last seat: exactly one gets in", async () => {
    const agency = await makeOrg("Race Agency", { tier: "agency" }); // 5 seats
    await makePerson("race-owner", agency);
    for (const n of [1, 2, 3]) await makePerson(`race-member-${n}`, agency, "analyst");
    const runners = await Promise.all(
      ["runner-a", "runner-b"].map(async (label) => {
        const person = await makePerson(label, await makeOrg(`${label} Own`));
        return { person, invite: await invite(agency, person.profileId) };
      }),
    );
    const { joinWorkspaceByInvite } = await import("@/lib/auth/invite");
    const results = await Promise.all(
      runners.map(({ person, invite: inv }) =>
        joinWorkspaceByInvite({
          memberId: inv.id,
          organizationId: agency,
          profileId: person.profileId,
          email: person.email,
          leaveOpenWorkspace: true,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, refusal: { code: "no_seat" } });
    expect(await activeMembers(agency)).toBe(5);
  });

  it("a sign-up and a switch racing for the last seat: exactly one gets in", async () => {
    const agency = await makeOrg("Mixed Race Agency", { tier: "agency" });
    await makePerson("mixed-owner", agency);
    for (const n of [1, 2, 3]) await makePerson(`mixed-member-${n}`, agency, "viewer");
    const email = `mixed-new-${RUN}@accept-rules.example.com.au`;
    const forAddress = await invite(agency, null, "viewer", email);
    const switcher = await makePerson("mixed-switcher", await makeOrg("Switcher Own"));
    const forSwitcher = await invite(agency, switcher.profileId);
    const { joinWorkspaceByInvite, signUpByInvite } = await import("@/lib/auth/invite");
    const [signedUp, switched] = await Promise.all([
      signUpByInvite({
        organizationId: agency,
        token: forAddress.token,
        name: "Mixed New",
        email,
        passwordHash: "not-a-real-hash",
      }),
      joinWorkspaceByInvite({
        memberId: forSwitcher.id,
        organizationId: agency,
        profileId: switcher.profileId,
        email: switcher.email,
        leaveOpenWorkspace: true,
      }),
    ]);
    expect([signedUp.ok, switched.ok].filter(Boolean)).toHaveLength(1);
    expect(await activeMembers(agency)).toBe(5);
  });
});

describe("decision 8: no workspace email until the invite is accepted", () => {
  let agency = "";
  let owner: Person;
  beforeAll(async () => {
    agency = await makeOrg("Notifying Agency", { tier: "agency_pro" });
    owner = await makePerson("notify-owner", agency);
  });

  const recipients = async () => {
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    return (await resolveNotificationRecipients(agency, "audit_complete")).recipients;
  };

  it("a 'Not now' invitee gets none; the same person gets them after switching in", async () => {
    const pat = await makePerson("pat", await makeOrg("Pat Own"));
    const inv = await invite(agency, pat.profileId, "admin");
    expect(await recipients()).toEqual([owner.email.toLowerCase()]);

    const { joinWorkspaceByInvite } = await import("@/lib/auth/invite");
    const joined = await joinWorkspaceByInvite({
      memberId: inv.id,
      organizationId: agency,
      profileId: pat.profileId,
      email: pat.email,
      leaveOpenWorkspace: true,
    });
    expect(joined).toEqual({ ok: true, outcome: "joined" });
    expect(await recipients()).toContain(pat.email.toLowerCase());
  });

  it("a profile in the workspace whose admin membership is pending or removed gets none", async () => {
    const reinvited = await makePerson("reinvited", agency, null, "admin");
    await invite(agency, reinvited.profileId, "admin");
    const removed = await makePerson("removed", agency, null, "admin");
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${agency}, ${removed.profileId}, 'admin', now(), now(), false)
    `;
    const list = await recipients();
    expect(list).not.toContain(reinvited.email.toLowerCase());
    expect(list).not.toContain(removed.email.toLowerCase());
    expect(list).toContain(owner.email.toLowerCase());
  });
});

describe("decision 9: the only owner can't switch away from a workspace that still needs one", () => {
  let inviting = "";
  beforeAll(async () => {
    inviting = await makeOrg("Inviting Agency", { tier: "agency_pro" });
    await makePerson("inviting-owner", inviting);
  });

  const blocked = (name: string) =>
    `You're the only owner of ${name}. Make someone else owner or cancel the subscription first.`;

  async function tryToSwitch(person: Person) {
    const inv = await invite(inviting, person.profileId);
    signInAs(person);
    const offered = await accept(inviting, inv.token, "GET");
    const switched = await accept(inviting, inv.token, "POST");
    return { inv, offered, switched };
  }

  it("a paid workspace: the choice says why, and Switch is refused with nothing moved", async () => {
    const own = await makeOrg("Paid Own Agency", { tier: "agency", status: "active" });
    const lee = await makePerson("paid-owner", own);
    const { inv, offered, switched } = await tryToSwitch(lee);
    expect(offered.status).toBe(200);
    expect(offered.body).toMatchObject({ choice: true, switchBlocked: blocked("Paid Own Agency") });
    expect(switched.status).toBe(409);
    expect(switched.body).toEqual({ error: blocked("Paid Own Agency"), code: "only_owner" });
    expect(await where(lee.profileId)).toBe(own);
    expect(await inviteState(inv.id)).toEqual({ accepted_at: null, is_active: false });
  });

  it("a past-due subscription counts as not cancelled", async () => {
    const own = await makeOrg("Past Due Agency", { tier: "starter", status: "past_due" });
    const owner = await makePerson("past-due-owner", own);
    const { switched } = await tryToSwitch(owner);
    expect(switched.status).toBe(409);
    expect(await where(owner.profileId)).toBe(own);
  });

  it("a workspace with another member: refused", async () => {
    const own = await makeOrg("Team Own Agency");
    const owner = await makePerson("team-owner", own);
    await makePerson("team-analyst", own, "analyst");
    const { switched } = await tryToSwitch(owner);
    expect(switched.status).toBe(409);
    expect(switched.body.error).toBe(blocked("Team Own Agency"));
    expect(await where(owner.profileId)).toBe(own);
  });

  it("a workspace with an active audit schedule: refused", async () => {
    const own = await makeOrg("Scheduled Own Agency");
    const owner = await makePerson("scheduled-owner", own);
    const brandId = randomUUID();
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
      VALUES (${brandId}, ${own}, 'Scheduled Co', ${`${brandId.slice(0, 8)}.example.com.au`}, 'tradies', 'au', ARRAY[]::text[])
    `;
    await sql`
      INSERT INTO audit_schedules (organization_id, brand_id, frequency, status, next_run_at)
      VALUES (${own}, ${brandId}, 'weekly', 'active', now() + interval '1 day')
    `;
    const { switched } = await tryToSwitch(owner);
    expect(switched.status).toBe(409);
    expect(await where(owner.profileId)).toBe(own);
  });

  it("an empty free workspace can be left: switched, with the existing warning's outcome", async () => {
    const own = await makeOrg("Empty Own Agency");
    const owner = await makePerson("empty-owner", own);
    const { offered, switched } = await tryToSwitch(owner);
    expect(offered.body).not.toHaveProperty("switchBlocked");
    expect(switched.status).toBe(200);
    expect(switched.body).toMatchObject({ accepted: true, joined: true });
    expect(await where(owner.profileId)).toBe(inviting);
  });

  it("a cancelled subscription and nothing else: can be left", async () => {
    const own = await makeOrg("Cancelled Own Agency", { tier: "agency", status: "canceled" });
    const owner = await makePerson("cancelled-owner", own);
    const { switched } = await tryToSwitch(owner);
    expect(switched.status).toBe(200);
    expect(await where(owner.profileId)).toBe(inviting);
  });

  it("a paid workspace with another owner: can be left, the other owner stays", async () => {
    const own = await makeOrg("Two Owners Agency", { tier: "agency", status: "active" });
    const owner = await makePerson("first-owner", own);
    await makePerson("second-owner", own);
    const { switched } = await tryToSwitch(owner);
    expect(switched.status).toBe(200);
    expect(await where(owner.profileId)).toBe(inviting);
  });
});
