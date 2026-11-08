/**
 * Follow-ups from 6e27afc..01a6a8c, part 2 (Sri, 8 Nov: refuse a second workspace) -- an account that
 * already belongs to a workspace can't make another. It used to: POST /api/auth/workspace, or better-auth's
 * own organization/create, made the organisation and an app workspace row, and the account's profile stayed
 * where it was, leaving an empty workspace behind (diag-0133). Now both refuse, "You already belong to
 * <org>.", with nothing made in either table. Real better-auth accounts, sessions and routes against the
 * test database; only next/headers and the email send stand in.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
const BASE = "http://localhost:3000";
const PASSWORD = "CorrectHorse123!";
const authIds: string[] = [];

let sql: ReturnType<typeof postgres>;

/** A real account, verified and signed in; its session cookie becomes the request's. */
async function signedInAccount(label: string): Promise<{ authId: string; cookie: string }> {
  const { auth } = await import("@/lib/auth/server");
  const address = `${label}-${RUN}@provisioning.example.com.au`;
  await auth.api.signUpEmail({ body: { email: address, password: PASSWORD, name: label } });
  const [{ id }] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${address}`;
  authIds.push(id);
  await sql`UPDATE auth_users SET email_verified = true WHERE id = ${id}`;
  const res = await auth.api.signInEmail({
    body: { email: address, password: PASSWORD },
    asResponse: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  request.cookie = cookie;
  return { authId: id, cookie };
}

async function createWorkspace(cookie: string, name: string) {
  const { POST } = await import("@/app/api/auth/workspace/route");
  const res = await POST(
    new Request(`${BASE}/api/auth/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: BASE },
      body: JSON.stringify({ name }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const authOrgsOf = async (authId: string) =>
  (
    await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM auth_members WHERE user_id = ${authId}`
  )[0].n;
const appOrgsNamed = async (name: string) =>
  (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM organizations WHERE name = ${name}`)[0]
    .n;

beforeAll(() => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
}, 60000);

afterAll(async () => {
  const authOrgs = await sql<{ id: string }[]>`
    SELECT organization_id AS id FROM auth_members WHERE user_id = ANY(${authIds})
  `;
  const authOrgIds = authOrgs.map((o) => o.id);
  const orgs = (
    await sql<
      { id: string }[]
    >`SELECT id FROM organizations WHERE clerk_org_id = ANY(${authOrgIds})`
  ).map((o) => o.id);
  await sql`DELETE FROM report_templates WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM data_residency_log WHERE organization_id = ANY(${orgs})`.catch(() => {});
  await sql`DELETE FROM audit_trail WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM users WHERE clerk_user_id = ANY(${authIds})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql`DELETE FROM auth_members WHERE user_id = ANY(${authIds})`;
  await sql`DELETE FROM auth_organizations WHERE id = ANY(${authOrgIds})`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ANY(${authIds})`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ANY(${authIds})`;
  await sql`DELETE FROM auth_users WHERE id = ANY(${authIds})`;
  await sql.end();
});

describe("an account that already belongs to a workspace can't make another", () => {
  const first = `Lee Studio ${RUN}`;
  let lee: { authId: string; cookie: string };

  beforeAll(async () => {
    lee = await signedInAccount("lee");
    expect((await createWorkspace(lee.cookie, first)).status).toBe(200);
  }, 60000);

  it("POST /api/auth/workspace: refused, naming it; nothing made in either table", async () => {
    const before = await authOrgsOf(lee.authId);
    const second = `Second ${RUN}`;
    const { status, body } = await createWorkspace(lee.cookie, second);
    expect(status).toBe(409);
    expect(body).toEqual({
      error: `You already belong to ${first}.`,
      code: "already_in_workspace",
    });
    expect(await authOrgsOf(lee.authId)).toBe(before);
    expect(await appOrgsNamed(second)).toBe(0);
  });

  it("better-auth's own organization/create: refused before it writes anything", async () => {
    const before = await authOrgsOf(lee.authId);
    const slug = `third-${RUN}`;
    const { auth } = await import("@/lib/auth/server");
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/organization/create`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: lee.cookie, origin: BASE },
        body: JSON.stringify({ name: `Third ${RUN}`, slug }),
      }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toBe(
      `You already belong to ${first}.`,
    );
    expect(await authOrgsOf(lee.authId)).toBe(before);
    expect(await sql`SELECT id FROM auth_organizations WHERE slug = ${slug}`).toHaveLength(0);
    expect(await appOrgsNamed(`Third ${RUN}`)).toBe(0);
  });

  it("removed from it (part 1), the same account can make one, and its profile moves there", async () => {
    const [profile] = await sql<{ id: string; organization_id: string }[]>`
      SELECT id, organization_id FROM users WHERE clerk_user_id = ${lee.authId}
    `;
    // Removed: the membership deactivated, as members/[memberId] DELETE does.
    await sql`
      UPDATE org_members SET is_active = false WHERE organization_id = ${profile.organization_id} AND user_id = ${profile.id}
    `;
    const fresh = `Lee Again ${RUN}`;
    expect((await createWorkspace(lee.cookie, fresh)).status).toBe(200);
    const [moved] = await sql<{ organization_id: string; name: string }[]>`
      SELECT u.organization_id, o.name FROM users u JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = ${profile.id}
    `;
    expect(moved.name).toBe(fresh);
  });
});

describe("a new account", () => {
  it("makes its first workspace: the row, the profile and the owner membership, together", async () => {
    const kim = await signedInAccount("kim");
    const name = `Kim Agency ${RUN}`;
    expect((await createWorkspace(kim.cookie, name)).status).toBe(200);
    const [row] = await sql<{ role: string; is_active: boolean; accepted: boolean }[]>`
      SELECT m.role, m.is_active, m.accepted_at IS NOT NULL AS accepted
      FROM users u
      JOIN organizations o ON o.id = u.organization_id AND o.name = ${name}
      JOIN org_members m ON m.organization_id = o.id AND m.user_id = u.id
      WHERE u.clerk_user_id = ${kim.authId}
    `;
    expect(row).toEqual({ role: "owner", is_active: true, accepted: true });
  });
});
