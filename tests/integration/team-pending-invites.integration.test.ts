/**
 * Team follow-ups (31 Oct), item 1 -- the Team page's pending invites say who they're for. On production a
 * pending invite showed only "analyst": the invitee's profile lives in their own workspace, and the
 * members list reads profiles under the inviting workspace's RLS context, which can't see it. The invite
 * route now records the address it emailed (org_members.invited_email, migration 0130), and the list
 * returns it with the expiry.
 *
 * The app's own connection runs as visibleau_app (NOSUPERUSER, NOBYPASSRLS), as on production: a superuser
 * would read the other workspace's profile and hide the bug.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
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

const ORG_ID = randomUUID();
const HOME_ORG_ID = randomUUID();
const OWNER_ID = randomUUID();
const INVITEE_ID = randomUUID();
const TAG = ORG_ID.slice(0, 8);
const OWNER = `owner-${TAG}@pending-invites.example.com.au`;
// Typed with capitals: the row shows the address as it was entered.
const INVITEE = `Lee.Invitee-${TAG}@pending-invites.example.com.au`;

let su: ReturnType<typeof postgres>;

function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

async function invite(email: string, role = "analyst") {
  const { POST } = await import("@/app/api/organizations/[orgId]/members/invite/route");
  const res = await POST(
    new Request(`http://localhost:3000/api/organizations/${ORG_ID}/members/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    }),
    { params: Promise.resolve({ orgId: ORG_ID }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

interface Member {
  id: string;
  userId: string;
  role: string;
  acceptedAt: string | null;
  invitedAt: string | null;
  expiresAt: string;
  email: string | null;
  invitedEmail: string | null;
}

async function members(): Promise<Member[]> {
  const { GET } = await import("@/app/api/organizations/[orgId]/members/route");
  const res = await GET(new Request(`http://localhost:3000/api/organizations/${ORG_ID}/members`), {
    params: Promise.resolve({ orgId: ORG_ID }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Member[];
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  su = postgres(url, { max: 1 });
  process.env.DATABASE_URL = appRoleUrl();
  process.env.SERVICE_DATABASE_URL = url;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.vunnara.com.au";

  for (const [id, name] of [
    [ORG_ID, "Splice Test Agency"],
    [HOME_ORG_ID, "Invitee's Own Workspace"],
  ]) {
    await su`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${id}, ${`pending-invites-${id}`}, ${name}, ${`pending-invites-${id}`})
    `;
  }
  await su`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role) VALUES
      (${OWNER_ID}, ${`pending-invites-${OWNER_ID}`}, ${ORG_ID}, ${OWNER}, 'Owner', 'owner'),
      (${INVITEE_ID}, ${`pending-invites-${INVITEE_ID}`}, ${HOME_ORG_ID}, ${INVITEE}, 'Lee', 'owner')
  `;
  await su`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${OWNER_ID}, 'owner', now(), now(), true)
  `;
  await su`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency', 'monthly', 'active')
  `;
  currentUserMock.mockResolvedValue({
    id: OWNER_ID,
    organizationId: ORG_ID,
    email: OWNER,
    name: "Owner",
    role: "owner",
    organization: { id: ORG_ID, name: "Splice Test Agency" },
  });
  sendEmailMock.mockResolvedValue({ ok: true, id: "em_1" });
}, 60000);

afterAll(async () => {
  await su`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await su`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await su`DELETE FROM users WHERE id IN (${OWNER_ID}, ${INVITEE_ID})`;
  await su`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await su`DELETE FROM organizations WHERE id IN (${ORG_ID}, ${HOME_ORG_ID})`;
  await su`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'team-invite:%'`;
  await su.end();
});

describe("a pending invite for someone in another workspace", () => {
  it("is listed with the address it was sent to and its 7-day expiry", async () => {
    const before = Date.now();
    expect((await invite(INVITEE)).status).toBe(201);

    const pending = (await members()).filter((m) => !m.acceptedAt);
    expect(pending).toHaveLength(1);
    const [row] = pending;
    expect(row.userId).toBe(INVITEE_ID);
    expect(row.role).toBe("analyst");
    expect(row.invitedEmail).toBe(INVITEE);
    // Why the address has to be stored: the invitee's profile is out of this workspace's sight.
    expect(row.email).toBeNull();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const expires = new Date(row.expiresAt).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(expires).toBeLessThanOrEqual(Date.now() + sevenDays + 1000);
    expect(new Date(row.invitedAt ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("re-sending it keeps the address and moves the expiry on", async () => {
    const [first] = (await members()).filter((m) => !m.acceptedAt);
    await su`
      UPDATE org_members SET expires_at = now() - interval '1 day' WHERE id = ${first.id}
    `;
    expect((await invite(INVITEE)).status).toBe(200);
    const [row] = (await members()).filter((m) => !m.acceptedAt);
    expect(row.id).toBe(first.id);
    expect(row.invitedEmail).toBe(INVITEE);
    expect(new Date(row.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
