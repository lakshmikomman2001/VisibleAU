/**
 * Adds the Agency-plan test user to the local e2e database (pnpm
 * seed:e2e-agency): tests/e2e/helpers/agency-user.ts. Refuses any other database.
 * The specs that need it seed it themselves; this is for trying it by hand.
 */
import path from "node:path";
import { config } from "dotenv";
import { E2E_AGENCY_USER, ensureE2eAgencyUser } from "../tests/e2e/helpers/agency-user";

config({ path: path.resolve(process.cwd(), ".env.test.local") });

ensureE2eAgencyUser()
  .then(() => {
    console.log(`Agency-plan test user ready: ${E2E_AGENCY_USER.email}`);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
