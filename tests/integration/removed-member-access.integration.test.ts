/**
 * Follow-ups from 6e27afc..01a6a8c, part 1 (security; Sri, 8 Nov: removed members lose access
 * immediately). A removed member whose profile lived in the workspace could still open it: getCurrentUser
 * never looked at the membership, and roleOf fell back to the profile's own users.role. Now access needs
 * an active, accepted membership, read on every request.
 *
 * Real better-auth accounts and sessions, the real (auth) layout and routes, the app's own connection as
 * visibleau_app (RLS on); only next/headers stands in for the request, carrying the session cookie of
 * whoever is "signed in".
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(request.cookie ? { cookie: request.cookie } : {})),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async () => ({ ok: true, id: "em_test" })),
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const RUN = randomUUID().slice(0, 8);
const BASE = "http://localhost:3000";
const PASSWORD = "CorrectHorse123!";
const WORKSPACE = randomUUID();
const BRAND = randomUUID();

interface Person {
  key: "owner" | "analyst" | "admin" | "member";
  address: string;
  authId: string;
  profileId: string;
  memberId: string;
  cookie: string;
}
const people: Partial<Record<Person["key"], Person>> = {};
const person = (key: Person["key"]) => people[key] as Person;
const madeOrgs: string[] = [WORKSPACE];

let su: ReturnType<typeof postgres>;

function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

async function signIn(address: string): Promise<string> {
  const { auth } = await import("@/lib/auth/server");
  const res = await auth.api.signInEmail({
    body: { email: address, password: PASSWORD },
    asResponse: true,
  });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** A real account, signed in, with a profile in the workspace and an accepted membership in `role`. */
async function addPerson(key: Person["key"], role: string, name: string): Promise<void> {
  const { auth } = await import("@/lib/auth/server");
  const address = `${key}-${RUN}@removed-member.example.com.au`;
  await auth.api.signUpEmail({ body: { email: address, password: PASSWORD, name } });
  const [{ id: authId }] = await su<
    { id: string }[]
  >`SELECT id FROM auth_users WHERE email = ${address}`;
  await su`UPDATE auth_users SET email_verified = true WHERE id = ${authId}`;
  const profileId = randomUUID();
  await su`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${profileId}, ${authId}, ${WORKSPACE}, ${address}, ${name}, ${role})
  `;
  const [{ id: memberId }] = await su<{ id: string }[]>`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${WORKSPACE}, ${profileId}, ${role}, now(), now(), true)
    RETURNING id
  `;
  people[key] = { key, address, authId, profileId, memberId, cookie: await signIn(address) };
}

const as = (key: Person["key"]) => {
  request.cookie = person(key).cookie;
};

async function call(
  load: () => Promise<Record<string, unknown>>,
  method: string,
  url: string,
  params: Record<string, string>,
  body?: unknown,
) {
  const mod = await load();
  const handler = mod[method] as (
    req: Request,
    ctx: { params: Promise<Record<string, string>> },
  ) => Promise<Response>;
  const res = await handler(
    new Request(`${BASE}${url}`, {
      method,
      headers: { "content-type": "application/json", cookie: request.cookie, origin: BASE },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve(params) },
  );
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

const taskRoute = () => import("@/app/api/brands/[brandId]/tasks/route");
const memberRoute = () => import("@/app/api/organizations/[orgId]/members/[memberId]/route");

/** The (auth) layout's answer: "rendered", or where it redirected. */
async function layout(): Promise<string> {
  const { default: AuthLayout } = await import("@/app/(auth)/layout");
  try {
    await AuthLayout({ children: null });
    return "rendered";
  } catch (e) {
    const digest = String((e as { digest?: unknown }).digest ?? "");
    if (!digest.startsWith("NEXT_REDIRECT")) throw e;
    return digest.split(";")[2] ?? digest;
  }
}

async function currentWorkspace(): Promise<string | null> {
  const { getCurrentUser } = await import("@/lib/auth/current-user");
  return (await getCurrentUser())?.organizationId ?? null;
}

const tasksOf = async (title: string) =>
  su`SELECT id FROM remediation_tasks WHERE brand_id = ${BRAND} AND title = ${title}`;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  su = postgres(url, { max: 1 });
  // The app's own connection is the RLS-enforced role; the service connection stays privileged.
  process.env.DATABASE_URL = appRoleUrl();
  process.env.SERVICE_DATABASE_URL = url;

  await su`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${WORKSPACE}, ${`removed-member-${RUN}`}, 'Removal Agency', ${`removed-member-${RUN}`})
  `;
  await su`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${WORKSPACE}, ${`cus_${WORKSPACE}`}, ${`sub_${WORKSPACE}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;
  await su`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND}, ${WORKSPACE}, 'Removal Co', ${`${BRAND.slice(0, 8)}.example.com.au`}, 'tradies', 'au', ARRAY[]::text[])
  `;
  await addPerson("owner", "owner", "Olive Owner");
  await addPerson("analyst", "analyst", "Ash Analyst");
  await addPerson("admin", "admin", "Dana Admin");
  await addPerson("member", "viewer", "Mel Member");
}, 120_000);

afterAll(async () => {
  const authIds = Object.values(people).map((p) => p.authId);
  const authOrgs = await su<{ id: string }[]>`
    SELECT organization_id AS id FROM auth_members WHERE user_id = ANY(${authIds})
  `;
  const appOrgs = await su<{ id: string }[]>`
    SELECT id FROM organizations WHERE clerk_org_id = ANY(${authOrgs.map((o) => o.id)})
  `;
  const orgs = [...madeOrgs, ...appOrgs.map((o) => o.id)];
  await su`DELETE FROM remediation_tasks WHERE organization_id = ANY(${orgs})`;
  await su`DELETE FROM audit_trail WHERE organization_id = ANY(${orgs})`;
  await su`DELETE FROM report_templates WHERE organization_id = ANY(${orgs})`;
  await su`DELETE FROM data_residency_log WHERE organization_id = ANY(${orgs})`.catch(() => {});
  await su`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await su`DELETE FROM users WHERE clerk_user_id = ANY(${authIds}) OR organization_id = ANY(${orgs})`;
  await su`DELETE FROM brands WHERE organization_id = ANY(${orgs})`;
  await su`DELETE FROM subscriptions WHERE organization_id = ANY(${orgs})`;
  await su`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await su`DELETE FROM auth_members WHERE user_id = ANY(${authIds})`;
  await su`DELETE FROM auth_organizations WHERE id = ANY(${authOrgs.map((o) => o.id)})`;
  await su`DELETE FROM auth_sessions WHERE user_id = ANY(${authIds})`;
  await su`DELETE FROM auth_accounts WHERE user_id = ANY(${authIds})`;
  await su`DELETE FROM auth_verifications WHERE identifier LIKE ${`%${RUN}%`}`.catch(() => {});
  await su`DELETE FROM auth_users WHERE id = ANY(${authIds})`;
  await su.end();
});

describe("a removed member has no workspace from the very next request", () => {
  it("before removal: the analyst opens the workspace and adds a task", async () => {
    as("analyst");
    expect(await currentWorkspace()).toBe(WORKSPACE);
    expect(await layout()).toBe("rendered");
    const { status } = await call(
      taskRoute,
      "POST",
      `/api/brands/${BRAND}/tasks`,
      { brandId: BRAND },
      {
        title: `Before removal ${RUN}`,
      },
    );
    expect(status).toBe(201);
    // What the trail keeps of them (any action they take records one the same way).
    const { recordAction } = await import("@/lib/governance");
    await recordAction({
      organizationId: WORKSPACE,
      userId: person("analyst").profileId,
      action: "task_completed",
      resourceType: "task",
    });
  });

  it("the owner removes them", async () => {
    as("owner");
    const { status } = await call(
      memberRoute,
      "DELETE",
      `/api/organizations/${WORKSPACE}/members/${person("analyst").memberId}`,
      { orgId: WORKSPACE, memberId: person("analyst").memberId },
    );
    expect(status).toBe(200);
  });

  it("same session, next request: the page sends them to /no-workspace; the API refuses; nothing made", async () => {
    as("analyst");
    expect(await currentWorkspace()).toBeNull();
    expect(await layout()).toBe("/no-workspace");
    const title = `After removal ${RUN}`;
    const { status } = await call(
      taskRoute,
      "POST",
      `/api/brands/${BRAND}/tasks`,
      { brandId: BRAND },
      {
        title,
      },
    );
    expect(status).toBe(401);
    expect(await tasksOf(title)).toHaveLength(0);
    const brands = await call(() => import("@/app/api/brands/route"), "GET", "/api/brands", {});
    expect(brands.status).toBe(401);
  });

  it("their profile stays where it was: the workspace's history still points at it", async () => {
    const [profile] = await su<{ organization_id: string }[]>`
      SELECT organization_id FROM users WHERE id = ${person("analyst").profileId}
    `;
    expect(profile.organization_id).toBe(WORKSPACE);
  });
});

describe("a demoted admin loses admin actions on the next request", () => {
  it("the owner makes the admin a viewer; the next invite they send is refused", async () => {
    as("owner");
    const demoted = await call(
      memberRoute,
      "PATCH",
      `/api/organizations/${WORKSPACE}/members/${person("admin").memberId}`,
      { orgId: WORKSPACE, memberId: person("admin").memberId },
      { role: "viewer" },
    );
    expect(demoted.status).toBe(200);

    as("admin");
    const invited = await call(
      () => import("@/app/api/organizations/[orgId]/members/invite/route"),
      "POST",
      `/api/organizations/${WORKSPACE}/members/invite`,
      { orgId: WORKSPACE },
      { email: `someone-${RUN}@removed-member.example.com.au`, role: "viewer" },
    );
    expect(invited.status).toBe(403);
    const { status } = await call(
      () => import("@/app/api/brands/[brandId]/route"),
      "PATCH",
      `/api/brands/${BRAND}`,
      { brandId: BRAND },
      { name: "Renamed by a viewer" },
    );
    expect(status).toBe(403);
  });
});

describe("a removed member who makes a workspace of their own", () => {
  it("is moved into it, as its owner -- the same profile, so the old workspace's history still names them", async () => {
    as("analyst");
    const { POST } = await import("@/app/api/auth/workspace/route");
    const res = await POST(
      new Request(`${BASE}/api/auth/workspace`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: request.cookie, origin: BASE },
        body: JSON.stringify({ name: `Ash Studio ${RUN}` }),
      }),
    );
    expect(res.status).toBe(200);

    const [profile] = await su<{ organization_id: string; role: string }[]>`
      SELECT organization_id, role FROM users WHERE id = ${person("analyst").profileId}
    `;
    expect(profile.organization_id).not.toBe(WORKSPACE);
    madeOrgs.push(profile.organization_id);
    const [membership] = await su<{ role: string; is_active: boolean }[]>`
      SELECT role, is_active FROM org_members
      WHERE organization_id = ${profile.organization_id} AND user_id = ${person("analyst").profileId}
    `;
    expect(membership).toEqual({ role: "owner", is_active: true });
    expect(await currentWorkspace()).toBe(profile.organization_id);

    // The old workspace's trail, read by its owner through the app's RLS role.
    as("owner");
    const trail = await call(
      () => import("@/app/api/organizations/[orgId]/audit-trail/route"),
      "GET",
      `/api/organizations/${WORKSPACE}/audit-trail`,
      { orgId: WORKSPACE },
    );
    expect(trail.status).toBe(200);
    const theirs = (
      trail.body.entries as Array<{ actor: { id: string; name: string | null } | null }>
    ).filter((e) => e.actor?.id === person("analyst").profileId);
    expect(theirs.length).toBeGreaterThan(0);
    for (const entry of theirs) expect(entry.actor?.name).toBe("Ash Analyst");
  });
});

describe("an active member is unaffected", () => {
  it("opens the workspace and reads its brands", async () => {
    as("member");
    expect(await currentWorkspace()).toBe(WORKSPACE);
    expect(await layout()).toBe("rendered");
    const brands = await call(() => import("@/app/api/brands/route"), "GET", "/api/brands", {});
    expect(brands.status).toBe(200);
  });
});
