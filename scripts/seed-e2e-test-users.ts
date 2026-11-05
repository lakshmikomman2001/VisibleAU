/**
 * Verifies the shared e2e accounts and links their profiles by id, in the local
 * e2e database (pnpm seed:e2e-users): tests/e2e/helpers/test-users.ts. Refuses any
 * other database. Run before Playwright specs that sign in as E2E_TEST_USER_1 or _2.
 * A user with no profile yet gets the workspace its specs use (E2E_TEST_ORG_<n>_CLERK_ID).
 */
import path from "node:path";
import { config } from "dotenv";
import { linkE2eTestUsers } from "../tests/e2e/helpers/test-users";

config({ path: path.resolve(process.cwd(), ".env.test.local") });

const users = [1, 2].flatMap((n) => {
  const address = process.env[`E2E_TEST_USER_${n}_EMAIL`];
  const clerkOrgId = process.env[`E2E_TEST_ORG_${n}_CLERK_ID`];
  if (!address) return [];
  return [{ address, ...(clerkOrgId ? { workspace: { clerkOrgId, name: `E2E Org ${n}` } } : {}) }];
});

linkE2eTestUsers(users)
  .then((results) => {
    const linked = results.filter((r) => r.verified && r.linked).length;
    const created = results.filter((r) => r.created).length;
    console.log(
      `${linked} of ${results.length} e2e test users verified and linked by id${created ? ` (${created} given the profile and workspace their specs use)` : ""}.`,
    );
    results.forEach((r, i) => {
      if (!r.verified) console.log(`User ${i + 1} has no account with that address.`);
      else if (!r.linked)
        console.log(`User ${i + 1} has no profile, and no workspace id to make one.`);
    });
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
