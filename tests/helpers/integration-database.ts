/**
 * 13 Nov, part 6 -- the integration tests' own database. They shared visibleau_e2e with Playwright, and a phase2
 * sprint4 test's truncateAll() (tests/phase2/sprint4/helpers/test-db.ts: TRUNCATE organizations, ..., vertical_packs
 * CASCADE) removed user 1's membership and all 336 vertical-pack prompts in the last run, so Playwright specs failed
 * on database state. Now the "integration" vitest project runs against visibleau_integration only (vitest.config.ts
 * sets its env from here; tests/integration/global-setup.ts refuses anything else), and Playwright keeps
 * visibleau_e2e (tests/e2e/helpers/e2e-database.ts refuses anything else). Created and migrated by
 * `pnpm db:setup:integration` (scripts/db/migrate-local.ts --create-database).
 *
 * Relative imports only: vitest.config.ts and scripts/ load this without the @/ alias.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse as parseEnv } from "dotenv";
import { assertLocalSafeDatabaseUrl } from "../../scripts/db/local-db-guard";
import { E2E_DATABASE, INTEGRATION_DATABASE } from "../e2e/helpers/e2e-database";

export { INTEGRATION_DATABASE };

/** The URL, if it names the local integration database. Throws for anything else, without connecting. */
export function assertIntegrationDatabaseUrl(
  rawUrl: string | undefined,
  variable = "DATABASE_URL",
): string {
  if (!rawUrl) throw new Error(`${variable} is not set: load .env.test.local first.`);
  assertLocalSafeDatabaseUrl(rawUrl);
  const name = new URL(rawUrl).pathname.replace(/^\//, "");
  if (name !== INTEGRATION_DATABASE) {
    throw new Error(
      `Refusing to run: integration tests use only ${INTEGRATION_DATABASE}, not "${name}"` +
        (name === E2E_DATABASE
          ? ` (${E2E_DATABASE} is Playwright's; no integration test may touch it).`
          : "."),
    );
  }
  return rawUrl;
}

/**
 * The integration database's URL: INTEGRATION_DATABASE_URL when it's set, otherwise .env.test.local's
 * TEST_DATABASE_URL (the local server and credentials) with the database named visibleau_integration.
 */
export function integrationDatabaseUrl(env: Readonly<Record<string, string | undefined>>): string {
  if (env.INTEGRATION_DATABASE_URL) {
    return assertIntegrationDatabaseUrl(env.INTEGRATION_DATABASE_URL, "INTEGRATION_DATABASE_URL");
  }
  const base = env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is not set: load .env.test.local first.");
  assertLocalSafeDatabaseUrl(base);
  const url = new URL(base);
  url.pathname = `/${INTEGRATION_DATABASE}`;
  return assertIntegrationDatabaseUrl(url.toString(), "the integration database URL");
}

/** Every database variable the app and the tests read, each the integration database. */
export const INTEGRATION_DATABASE_VARIABLES = [
  "DATABASE_URL",
  "DIRECT_URL",
  "TEST_DATABASE_URL",
  "SERVICE_DATABASE_URL",
] as const;

export function integrationEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<(typeof INTEGRATION_DATABASE_VARIABLES)[number], string> {
  const url = integrationDatabaseUrl(env);
  return {
    DATABASE_URL: url,
    DIRECT_URL: url,
    TEST_DATABASE_URL: url,
    SERVICE_DATABASE_URL: url,
  };
}

/**
 * vitest.config.ts's "integration" project env: every database variable is visibleau_integration, from the env
 * file's TEST_DATABASE_URL (or the shell's). When that's missing or unsafe, each is "", so a test fails to connect
 * rather than falling back to the e2e database (dotenv never overwrites a variable that's set), and
 * tests/integration/global-setup.ts says what's missing.
 */
export function integrationProjectEnv(
  envFile: string,
  processEnv: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile)) : {};
  try {
    return integrationEnv({ ...fromFile, ...processEnv });
  } catch {
    return Object.fromEntries(INTEGRATION_DATABASE_VARIABLES.map((v) => [v, ""]));
  }
}
