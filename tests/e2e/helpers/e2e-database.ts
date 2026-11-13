/**
 * The one guard every Playwright spec and e2e helper that writes calls before it connects: the local
 * e2e database (visibleau_e2e on localhost), nothing else. Playwright-run follow-ups (9 Nov), part 1:
 * the 7 root specs and the tests/qa helpers wrote to whatever DATABASE_URL named, and the folder specs
 * only refused a name containing "visibleau_prod" (four of their configs fell back to the dev database).
 *
 * Relative imports only: tests/qa/* run under their own Playwright configs.
 */
import { assertLocalSafeDatabaseUrl } from "../../../scripts/db/local-db-guard";

export const E2E_DATABASE = "visibleau_e2e";

/** The URL, if it's the local e2e database. Throws for anything else, without connecting. */
export function assertE2eDatabaseUrl(
  rawUrl: string | undefined,
  variable = "TEST_DATABASE_URL",
): string {
  if (!rawUrl) throw new Error(`${variable} is not set: load .env.test.local first.`);
  assertLocalSafeDatabaseUrl(rawUrl);
  const name = new URL(rawUrl).pathname.replace(/^\//, "");
  if (name !== E2E_DATABASE) {
    throw new Error(
      `Refusing to run: e2e specs and their helpers write only to ${E2E_DATABASE}, not "${name}".`,
    );
  }
  return rawUrl;
}

/** The integration tests' own database (13 Nov, part 6: tests/helpers/integration-database.ts). */
export const INTEGRATION_DATABASE = "visibleau_integration";

/**
 * 13 Nov, part 6: the seed helpers (spec-account.ts, agency-user.ts) write to the local test database they're
 * pointed at -- Playwright's visibleau_e2e (loadE2eEnv already insists on it for every spec and the server), or
 * the integration tests' own visibleau_integration, where their own integration tests run them, so those never
 * write to Playwright's data. Nothing else. Throws without connecting.
 */
export function assertSeedDatabaseUrl(
  rawUrl: string | undefined,
  variable = "TEST_DATABASE_URL",
): string {
  if (!rawUrl) throw new Error(`${variable} is not set: load .env.test.local first.`);
  assertLocalSafeDatabaseUrl(rawUrl);
  const name = new URL(rawUrl).pathname.replace(/^\//, "");
  if (name !== E2E_DATABASE && name !== INTEGRATION_DATABASE) {
    throw new Error(
      `Refusing to run: the e2e seed helpers write only to ${E2E_DATABASE} or ${INTEGRATION_DATABASE}, not "${name}".`,
    );
  }
  return rawUrl;
}

/** DATABASE_URL, checked: what a spec's own postgres client connects with. */
export function e2eDatabaseUrl(): string {
  return assertE2eDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL");
}
