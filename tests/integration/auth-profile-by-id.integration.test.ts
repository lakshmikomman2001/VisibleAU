/**
 * 3 Nov ("Close the email-fallback account takeover") -- a profile is found only
 * by its account id. getCurrentUser used to fall back to users.email, so signing
 * up with the address of a profile that had no account opened that profile's
 * workspace, in its role. Against the real better-auth config, the real routes
 * and the local test database (only next/headers stands in for a request).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(request.cookie ? { cookie: request.cookie } : {})),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async () => ({ ok: true, id: "em_test" })),
}));

const RUN = randomUUID().slice(0, 8);
const PASSWORD = "CorrectHorse123!";
const ORPHAN_ADDRESS = `orphan-${RUN}@profile-by-id.example.com.au`;
const LINKED_ADDRESS = `linked-${RUN}@profile-by-id.example.com.au`;
const INVITEE_ADDRESS = `invitee-${RUN}@profile-by-id.example.com.au`;
const CLOSED_ADDRESS = `closed-${RUN}@profile-by-id.example.com.au`;
const VICTIM_ORG = randomUUID();
const LINKED_ORG = randomUUID();
const CLOSED_ORG = randomUUID();
const ORPHAN_PROFILE = randomUUID();
const LINKED_PROFILE = randomUUID();
const INVITEE_PROFILE = randomUUID();
const CLOSED_PROFILE = randomUUID();
const ORPHAN_INVITE_TOKEN = `orphan-invite-${RUN}-0123456789`;
const INVITE_TOKEN = `linked-invite-${RUN}-0123456789`;
const CLOSED_INVITE_TOKEN = `closed-invite-${RUN}-0123456789`;

let sql: ReturnType<typeof postgres>;
const authUserIds: string[] = [];
const createdOrgs: string[] = [VICTIM_ORG, LINKED_ORG, CLOSED_ORG];

/** Signs up and signs in through better-auth: the session is a real one. */
async function signedInAccount(address: string): Promise<string> {
  const { auth } = await import("@/lib/auth/server");
  await auth.api.signUpEmail({ body: { email: address, password: PASSWORD, name: "Tester" } });
  const [row] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${address}`;
  authUserIds.push(row.id);
  await sql`UPDATE auth_users SET email_verified = true WHERE id = ${row.id}`;
  await signInAs(address);
  return row.id;
}

async function signInAs(address: string) {
  const { auth } = await import("@/lib/auth/server");
  const res = await auth.api.signInEmail({
    body: { email: address, password: PASSWORD },
    asResponse: true,
  });
  request.cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function seedOrg(id: string, label: string, closed = false) {
  const tag = id.slice(0, 8);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, deleted_at)
    VALUES (${id}, ${`profile-by-id-${tag}`}, ${`${label} ${tag}`}, ${`profile-by-id-${tag}`}, ${closed ? new Date() : null})
  `;
}

async function seedProfile(id: string, org: string, clerkId: string, address: string) {
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${id}, ${clerkId}, ${org}, ${address}, 'Person', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${org}, ${id}, 'owner', now() + interval '7 days', now(), true)
  `;
}

async function seedInvite(org: string, profile: string, token: string) {
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, invitation_token, expires_at, is_active)
    VALUES (${org}, ${profile}, 'viewer', ${token}, now() + interval '7 days', false)
  `;
}

async function accept(org: string, token: string) {
  const { GET } = await import("@/app/api/organizations/[orgId]/members/accept/route");
  const res = await GET(
    new Request(`http://localhost/api/organizations/${org}/members/accept?token=${token}`),
    { params: Promise.resolve({ orgId: org }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  await seedOrg(VICTIM_ORG, "Victim Workspace");
  await seedOrg(LINKED_ORG, "Linked Workspace");
  await seedOrg(CLOSED_ORG, "Closed Workspace", true);
  // A profile with an address and no account: the only kind the fallback exposed.
  await seedProfile(ORPHAN_PROFILE, VICTIM_ORG, `no-account-${RUN}`, ORPHAN_ADDRESS);
  await seedInvite(LINKED_ORG, ORPHAN_PROFILE, ORPHAN_INVITE_TOKEN);
}, 60_000);

afterAll(async () => {
  const orgs = [...createdOrgs];
  // The better-auth organisations the workspace step made, before their app rows go.
  const authOrgs = await sql<{ clerk_org_id: string }[]>`
    SELECT clerk_org_id FROM organizations WHERE id = ANY(${orgs})
  `;
  const authOrgIds = authOrgs.map((o) => o.clerk_org_id);
  await sql`DELETE FROM auth_members WHERE organization_id = ANY(${authOrgIds})`;
  await sql`DELETE FROM auth_organizations WHERE id = ANY(${authOrgIds})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM report_templates WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM data_residency_log WHERE organization_id = ANY(${orgs})`.catch(() => {});
  await sql`DELETE FROM users WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  for (const id of authUserIds) {
    await sql`DELETE FROM auth_members WHERE user_id = ${id}`;
    await sql`DELETE FROM auth_sessions WHERE user_id = ${id}`;
    await sql`DELETE FROM auth_accounts WHERE user_id = ${id}`;
    await sql`DELETE FROM auth_users WHERE id = ${id}`;
  }
  await sql.end();
});

beforeEach(() => {
  request.cookie = "";
});

describe("signing up with the address of a profile that has no account", () => {
  let claimerId = "";

  beforeAll(async () => {
    claimerId = await signedInAccount(ORPHAN_ADDRESS);
  }, 30_000);

  beforeEach(async () => {
    await signInAs(ORPHAN_ADDRESS);
  });

  it("gets no access: the app finds no profile, so the account lands on /no-workspace", async () => {
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    expect(await getCurrentUser()).toBeNull();
    const { findAccountProfile } = await import("@/lib/auth/profile");
    expect(await findAccountProfile(claimerId)).toBeNull();
    const { getWorkspaceState } = await import("@/lib/auth/workspace-state");
    expect(await getWorkspaceState(claimerId)).toEqual({ kind: "none" });
  });

  it("can't take an invite meant for that profile", async () => {
    const { status, body } = await accept(LINKED_ORG, ORPHAN_INVITE_TOKEN);
    expect(status).toBe(403);
    expect(body.error).toMatch(/different email address/);
    const [invite] = await sql<{ accepted_at: Date | null }[]>`
      SELECT accepted_at FROM org_members WHERE invitation_token = ${ORPHAN_INVITE_TOKEN}
    `;
    expect(invite.accepted_at).toBeNull();
  });

  it("the profile stays as it was: nothing links it to the new account", async () => {
    const [profile] = await sql<{ clerk_user_id: string; organization_id: string }[]>`
      SELECT clerk_user_id, organization_id FROM users WHERE id = ${ORPHAN_PROFILE}
    `;
    expect(profile).toEqual({ clerk_user_id: `no-account-${RUN}`, organization_id: VICTIM_ORG });
  });

  it("creating a workspace makes its own, linked by id, and never touches that profile", async () => {
    const { auth } = await import("@/lib/auth/server");
    const { createWorkspace } = await import("@/lib/auth/workspace");
    const result = await createWorkspace(
      new Headers({ cookie: request.cookie }),
      { id: claimerId, email: ORPHAN_ADDRESS, name: "Tester" },
      `Own Workspace ${RUN}`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrgs.push(result.organizationId);
    expect(result.organizationId).not.toBe(VICTIM_ORG);

    const { getCurrentUser } = await import("@/lib/auth/current-user");
    const current = await getCurrentUser();
    expect(current?.organizationId).toBe(result.organizationId);
    expect(current?.clerkUserId).toBe(claimerId);
    expect(current?.id).not.toBe(ORPHAN_PROFILE);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: request.cookie }) });
    expect(session?.user.id).toBe(claimerId);
  });
});

describe("accounts linked by id are unaffected", () => {
  let linkedId = "";

  beforeAll(async () => {
    linkedId = await signedInAccount(LINKED_ADDRESS);
    await seedProfile(LINKED_PROFILE, LINKED_ORG, linkedId, LINKED_ADDRESS);
  }, 30_000);

  it("opens its own workspace", async () => {
    await signInAs(LINKED_ADDRESS);
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    const current = await getCurrentUser();
    expect(current?.id).toBe(LINKED_PROFILE);
    expect(current?.organization.id).toBe(LINKED_ORG);
  });

  it("a closed workspace still counts as none, and its profile is still found by id", async () => {
    await signInAs(LINKED_ADDRESS);
    await sql`UPDATE organizations SET deleted_at = now() WHERE id = ${LINKED_ORG}`;
    try {
      const { getCurrentUser } = await import("@/lib/auth/current-user");
      expect(await getCurrentUser()).toBeNull();
      const { findAccountProfile } = await import("@/lib/auth/profile");
      expect((await findAccountProfile(linkedId))?.id).toBe(LINKED_PROFILE);
    } finally {
      await sql`UPDATE organizations SET deleted_at = NULL WHERE id = ${LINKED_ORG}`;
    }
  });

  it("a signed-out request has none", async () => {
    request.cookie = "";
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("accepting an invite still links correctly, by the invited profile's id", () => {
  beforeAll(async () => {
    const inviteeId = await signedInAccount(INVITEE_ADDRESS);
    await seedProfile(INVITEE_PROFILE, VICTIM_ORG, inviteeId, INVITEE_ADDRESS);
    await seedInvite(LINKED_ORG, INVITEE_PROFILE, INVITE_TOKEN);

    const closedId = await signedInAccount(CLOSED_ADDRESS);
    await seedProfile(CLOSED_PROFILE, CLOSED_ORG, closedId, CLOSED_ADDRESS);
    await seedInvite(LINKED_ORG, CLOSED_PROFILE, CLOSED_INVITE_TOKEN);
  }, 30_000);

  it("another account signed in can't use the token", async () => {
    await signInAs(LINKED_ADDRESS);
    expect((await accept(LINKED_ORG, INVITE_TOKEN)).status).toBe(403);
  });

  it("the invited account accepts, and keeps its own workspace", async () => {
    await signInAs(INVITEE_ADDRESS);
    const { status, body } = await accept(LINKED_ORG, INVITE_TOKEN);
    expect(status).toBe(200);
    expect(body.accepted).toBe(true);
    const [member] = await sql<{ is_active: boolean; invitation_token: string | null }[]>`
      SELECT is_active, invitation_token FROM org_members
      WHERE organization_id = ${LINKED_ORG} AND user_id = ${INVITEE_PROFILE}
    `;
    expect(member).toEqual({ is_active: true, invitation_token: null });
    const [profile] = await sql<{ organization_id: string }[]>`
      SELECT organization_id FROM users WHERE id = ${INVITEE_PROFILE}
    `;
    expect(profile.organization_id).toBe(VICTIM_ORG);
  });

  it("the invited account whose workspace is closed joins the inviting one, found by id", async () => {
    await signInAs(CLOSED_ADDRESS);
    const { status, body } = await accept(LINKED_ORG, CLOSED_INVITE_TOKEN);
    expect(status).toBe(200);
    expect(body.joined).toBe(true);
    const [profile] = await sql<{ organization_id: string; role: string }[]>`
      SELECT organization_id, role FROM users WHERE id = ${CLOSED_PROFILE}
    `;
    expect(profile).toEqual({ organization_id: LINKED_ORG, role: "viewer" });
  });
});
