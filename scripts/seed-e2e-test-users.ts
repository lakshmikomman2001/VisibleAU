/**
 * Verifies the shared e2e accounts and links their profiles by id, in the local
 * e2e database (pnpm seed:e2e-users): tests/e2e/helpers/test-users.ts. Refuses any
 * other database. Run before Playwright specs that sign in as E2E_TEST_USER_1 or _2.
 */
import path from "node:path";
import { config } from "dotenv";
import { linkE2eTestUsers } from "../tests/e2e/helpers/test-users";

config({ path: path.resolve(process.cwd(), ".env.test.local") });

const addresses = [process.env.E2E_TEST_USER_1_EMAIL, process.env.E2E_TEST_USER_2_EMAIL].filter(
  (address): address is string => !!address,
);

linkE2eTestUsers(addresses)
  .then((results) => {
    const linked = results.filter((r) => r.verified && r.linked).length;
    console.log(`${linked} of ${results.length} e2e test users verified and linked by id.`);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
