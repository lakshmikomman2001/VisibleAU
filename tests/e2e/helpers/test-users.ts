/**
 * 3 Nov -- the shared e2e accounts (E2E_TEST_USER_1 and _2, used by most specs)
 * after the two sign-in changes: an unverified address gets no session, and a
 * profile is found only by its account id. In the e2e database their profiles came
 * from fixed fixture rows (tests/integration/shared-fixtures.ts) that only ever
 * matched by address, so this verifies each account and links its profile by id.
 *
 * 6 Nov -- E2E_TEST_USER_2 had an account and no profile at all: the specs that sign
 * in as it make its workspace and profile in their own beforeAll
 * (tests/e2e/helpers/db.ts, ensureOrganization and ensureUser), so before any of them
 * ran there was nothing to link ("1 of 2 linked"). A user given its `workspace` (the
 * specs' clerk org id) now gets that workspace and a profile linked by the account's
 * id, the rows those helpers would find and keep.
 *
 * In the local e2e database only (assertE2eDatabaseUrl refuses anything else before
 * connecting). Safe to run again; run it again after anything truncates the fixtures.
 * pnpm seed:e2e-users.
 */
import postgres from "postgres";
import { assertE2eDatabaseUrl } from "./agency-user";

export interface E2eTestUser {
  address: string;
  /** The workspace the specs give this user, made with its profile if it has none. */
  workspace?: { clerkOrgId: string; name: string };
}

export interface LinkedTestUser {
  verified: boolean;
  linked: boolean;
  /** No profile had the address, so its profile (and workspace, if new) was made here. */
  created: boolean;
}

export async function linkE2eTestUsers(
  users: E2eTestUser[],
  rawUrl = process.env.TEST_DATABASE_URL,
): Promise<LinkedTestUser[]> {
  const url = assertE2eDatabaseUrl(rawUrl);
  const sql = postgres(url, { max: 1 });
  try {
    const out: LinkedTestUser[] = [];
    for (const { address, workspace } of users) {
      const verified = await sql<{ id: string }[]>`
        UPDATE auth_users SET email_verified = true, updated_at = now()
        WHERE email = ${address} RETURNING id
      `;
      if (verified.length === 0) {
        out.push({ verified: false, linked: false, created: false });
        continue;
      }
      const accountId = verified[0].id;
      const linked = await sql`
        UPDATE users SET clerk_user_id = ${accountId}, updated_at = now()
        WHERE email = ${address} RETURNING id
      `;
      if (linked.length > 0 || !workspace) {
        out.push({ verified: true, linked: linked.length > 0, created: false });
        continue;
      }
      // What ensureOrganization and ensureUser make: found by these ids, so kept.
      const [org] = await sql<{ id: string }[]>`
        INSERT INTO organizations (clerk_org_id, name)
        VALUES (${workspace.clerkOrgId}, ${workspace.name})
        ON CONFLICT (clerk_org_id) DO UPDATE SET updated_at = now()
        RETURNING id
      `;
      const made = await sql`
        INSERT INTO users (clerk_user_id, organization_id, email, name, role)
        VALUES (${accountId}, ${org.id}, ${address}, 'E2E User', 'owner')
        ON CONFLICT (clerk_user_id) DO NOTHING
        RETURNING id
      `;
      out.push({ verified: true, linked: true, created: made.length > 0 });
    }
    return out;
  } finally {
    await sql.end();
  }
}
