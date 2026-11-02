/**
 * 3 Nov -- the shared e2e accounts (E2E_TEST_USER_1 and _2, used by most specs)
 * after the two sign-in changes: an unverified address gets no session, and a
 * profile is found only by its account id. In the e2e database their profiles came
 * from fixed fixture rows (tests/integration/shared-fixtures.ts) that only ever
 * matched by address, so this verifies each account and links its profile by id.
 *
 * In the local e2e database only (assertE2eDatabaseUrl refuses anything else before
 * connecting). Safe to run again; run it again after anything truncates the fixtures.
 * pnpm seed:e2e-users.
 */
import postgres from "postgres";
import { assertE2eDatabaseUrl } from "./agency-user";

export interface LinkedTestUser {
  verified: boolean;
  linked: boolean;
}

export async function linkE2eTestUsers(
  addresses: string[],
  rawUrl = process.env.TEST_DATABASE_URL,
): Promise<LinkedTestUser[]> {
  const url = assertE2eDatabaseUrl(rawUrl);
  const sql = postgres(url, { max: 1 });
  try {
    const out: LinkedTestUser[] = [];
    for (const address of addresses) {
      const verified = await sql<{ id: string }[]>`
        UPDATE auth_users SET email_verified = true, updated_at = now()
        WHERE email = ${address} RETURNING id
      `;
      if (verified.length === 0) {
        out.push({ verified: false, linked: false });
        continue;
      }
      const linked = await sql`
        UPDATE users SET clerk_user_id = ${verified[0].id}, updated_at = now()
        WHERE email = ${address} RETURNING id
      `;
      out.push({ verified: true, linked: linked.length > 0 });
    }
    return out;
  } finally {
    await sql.end();
  }
}
