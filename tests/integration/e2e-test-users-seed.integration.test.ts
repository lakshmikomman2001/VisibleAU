/**
 * 3 Nov -- the shared e2e accounts stay able to sign in once sign-in needs a
 * verified address and a profile linked by id (tests/e2e/helpers/test-users.ts): in
 * the local e2e database only, and against the real better-auth config.
 * 6 Nov -- and one with an account but no profile (E2E_TEST_USER_2 on the local e2e
 * database: "1 of 2 linked") gets the workspace its specs use, and a profile by id.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";
import { linkE2eTestUsers } from "../e2e/helpers/test-users";

vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async () => ({ ok: true, id: "em_test" })),
}));

const RUN = randomUUID().slice(0, 8);
const ADDRESS = `shared-${RUN}@e2e-users.example.com.au`;
const PASSWORD = "CorrectHorse123!";
const ORG = randomUUID();
const PROFILE = randomUUID();
// The second shared user's shape: an account, and no profile at all.
const BARE = `bare-${RUN}@e2e-users.example.com.au`;
const SPECS_ORG = `e2e-users-specs-${RUN}`;

let sql: ReturnType<typeof postgres>;
let accountId = "";
let bareAccountId = "";

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  const { auth } = await import("@/lib/auth/server");
  await auth.api.signUpEmail({ body: { email: ADDRESS, password: PASSWORD, name: "Shared" } });
  const [row] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${ADDRESS}`;
  accountId = row.id;
  await auth.api.signUpEmail({ body: { email: BARE, password: PASSWORD, name: "Bare" } });
  const [bare] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${BARE}`;
  bareAccountId = bare.id;
  // The shape of a shared fixture: a profile that only ever matched by address.
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`e2e-users-${RUN}`}, ${`E2E Users ${RUN}`}, ${`e2e-users-${RUN}`})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${PROFILE}, ${`fixture-${RUN}`}, ${ORG}, ${ADDRESS}, 'Shared', 'owner')
  `;
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM users WHERE id = ${PROFILE} OR clerk_user_id = ${bareAccountId}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG} OR clerk_org_id = ${SPECS_ORG}`;
  for (const id of [accountId, bareAccountId]) {
    await sql`DELETE FROM auth_sessions WHERE user_id = ${id}`;
    await sql`DELETE FROM auth_accounts WHERE user_id = ${id}`;
    await sql`DELETE FROM auth_users WHERE id = ${id}`;
  }
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'auth-email-%'`;
  await sql.end();
});

describe("linkE2eTestUsers", () => {
  it("refuses anything but the local e2e database, before connecting", async () => {
    const prod = "postgresql://user:secret@localhost:5432/visibleau_prod";
    await expect(linkE2eTestUsers([{ address: ADDRESS }], prod)).rejects.toThrow(/Refusing to run/);
    const dev = "postgresql://user:secret@localhost:5432/visibleau";
    await expect(linkE2eTestUsers([{ address: ADDRESS }], dev)).rejects.toThrow(/Refusing to run/);
  });

  it("verifies the account and links its profile by id, and it can then sign in", async () => {
    const { auth } = await import("@/lib/auth/server");
    await expect(
      auth.api.signInEmail({ body: { email: ADDRESS, password: PASSWORD } }),
    ).rejects.toThrow();

    expect(await linkE2eTestUsers([{ address: ADDRESS }])).toEqual([
      { verified: true, linked: true, created: false },
    ]);

    const signedIn = await auth.api.signInEmail({ body: { email: ADDRESS, password: PASSWORD } });
    expect(signedIn.token).toBeTruthy();
    const [profile] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE clerk_user_id = ${signedIn.user.id}
    `;
    expect(profile.id).toBe(PROFILE);
  });

  it("is safe to run again, and says when an address has no account", async () => {
    expect(
      await linkE2eTestUsers([
        { address: ADDRESS },
        { address: `nobody-${RUN}@e2e-users.example.com.au` },
      ]),
    ).toEqual([
      { verified: true, linked: true, created: false },
      { verified: false, linked: false, created: false },
    ]);
  });

  it("an account with no profile gets its specs' workspace and a profile by id, and signs in to it", async () => {
    // Without a workspace to give it there is nothing to link, and it says so.
    expect(await linkE2eTestUsers([{ address: BARE }])).toEqual([
      { verified: true, linked: false, created: false },
    ]);

    const workspace = { clerkOrgId: SPECS_ORG, name: "E2E Org 2" };
    expect(await linkE2eTestUsers([{ address: BARE, workspace }])).toEqual([
      { verified: true, linked: true, created: true },
    ]);

    const [profile] = await sql<{ organization_id: string; clerk_org_id: string; role: string }[]>`
      SELECT u.organization_id, o.clerk_org_id, u.role
      FROM users u JOIN organizations o ON o.id = u.organization_id
      WHERE u.clerk_user_id = ${bareAccountId}
    `;
    expect(profile).toMatchObject({ clerk_org_id: SPECS_ORG, role: "owner" });

    const { auth } = await import("@/lib/auth/server");
    const signedIn = await auth.api.signInEmail({ body: { email: BARE, password: PASSWORD } });
    expect(signedIn.user.id).toBe(bareAccountId);

    // Again: the same profile and workspace, nothing new.
    expect(await linkE2eTestUsers([{ address: BARE, workspace }])).toEqual([
      { verified: true, linked: true, created: false },
    ]);
    const [{ profiles, workspaces }] = await sql<{ profiles: number; workspaces: number }[]>`
      SELECT (SELECT count(*)::int FROM users WHERE clerk_user_id = ${bareAccountId}) AS profiles,
             (SELECT count(*)::int FROM organizations WHERE clerk_org_id = ${SPECS_ORG}) AS workspaces
    `;
    expect({ profiles, workspaces }).toEqual({ profiles: 1, workspaces: 1 });
  });
});
