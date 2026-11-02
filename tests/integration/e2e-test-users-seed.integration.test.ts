/**
 * 3 Nov -- the shared e2e accounts stay able to sign in once sign-in needs a
 * verified address and a profile linked by id (tests/e2e/helpers/test-users.ts): in
 * the local e2e database only, and against the real better-auth config.
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

let sql: ReturnType<typeof postgres>;
let accountId = "";

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  const { auth } = await import("@/lib/auth/server");
  await auth.api.signUpEmail({ body: { email: ADDRESS, password: PASSWORD, name: "Shared" } });
  const [row] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${ADDRESS}`;
  accountId = row.id;
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
  await sql`DELETE FROM users WHERE id = ${PROFILE}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql`DELETE FROM auth_sessions WHERE user_id = ${accountId}`;
  await sql`DELETE FROM auth_accounts WHERE user_id = ${accountId}`;
  await sql`DELETE FROM auth_users WHERE id = ${accountId}`;
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'auth-email-%'`;
  await sql.end();
});

describe("linkE2eTestUsers", () => {
  it("refuses anything but the local e2e database, before connecting", async () => {
    const prod = "postgresql://user:secret@localhost:5432/visibleau_prod";
    await expect(linkE2eTestUsers([ADDRESS], prod)).rejects.toThrow(/Refusing to run/);
    const dev = "postgresql://user:secret@localhost:5432/visibleau";
    await expect(linkE2eTestUsers([ADDRESS], dev)).rejects.toThrow(/Refusing to run/);
  });

  it("verifies the account and links its profile by id, and it can then sign in", async () => {
    const { auth } = await import("@/lib/auth/server");
    await expect(
      auth.api.signInEmail({ body: { email: ADDRESS, password: PASSWORD } }),
    ).rejects.toThrow();

    expect(await linkE2eTestUsers([ADDRESS])).toEqual([{ verified: true, linked: true }]);

    const signedIn = await auth.api.signInEmail({ body: { email: ADDRESS, password: PASSWORD } });
    expect(signedIn.token).toBeTruthy();
    const [profile] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE clerk_user_id = ${signedIn.user.id}
    `;
    expect(profile.id).toBe(PROFILE);
  });

  it("is safe to run again, and says when an address has no account", async () => {
    expect(await linkE2eTestUsers([ADDRESS, `nobody-${RUN}@e2e-users.example.com.au`])).toEqual([
      { verified: true, linked: true },
      { verified: false, linked: false },
    ]);
  });
});
