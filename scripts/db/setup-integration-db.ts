/**
 * 13 Nov, part 6 -- `pnpm db:setup:integration`: the integration tests' own database, visibleau_integration, on
 * the local server .env.test.local names (tests/helpers/integration-database.ts). Creates it when it's missing
 * and applies every migration and the app role's grants, through the one local migration path
 * (scripts/db/migrate-local.ts --create-database). Run it once, and again after each new migration, as for
 * visibleau and visibleau_e2e. It never touches visibleau_e2e: Playwright's data stays as its own seed scripts
 * left it.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { integrationDatabaseUrl } from "../../tests/helpers/integration-database";

const REPO_ROOT = resolve(__dirname, "../..");
config({ path: resolve(REPO_ROOT, ".env.test.local"), quiet: true });

const url = integrationDatabaseUrl(process.env);
const result = spawnSync("npx tsx scripts/db/migrate-local.ts --create-database", {
  cwd: REPO_ROOT,
  env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
