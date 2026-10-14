/**
 * Task #46 (8th follow-up): the one shared, env-driven way a test gets
 * a database URL to connect to directly (seeding/teardown via a raw
 * `postgres()` client, not through the app's own @/db/client). No
 * hardcoded database name lives here or in any caller -- the literal
 * lives in .env.test.local's TEST_DATABASE_URL, and every resolved URL
 * is run through the same guard scripts/db/local-db-guard.ts uses for
 * migrate-local.ts, so a test can never silently point at a database
 * named like prod or a neon.tech host.
 *
 * Deliberately requires TEST_DATABASE_URL specifically -- no fallback
 * to the generic DATABASE_URL (dropped in the 8th follow-up). A
 * fallback to DATABASE_URL meant a test's connection target silently
 * followed whatever ELSE last set that variable (the app's own
 * @/db/client, a different test file's beforeAll, a stray shell
 * export) -- exactly the kind of implicit coupling this whole task has
 * been removing. The guard below stays regardless, as defence in
 * depth, but requiring the test-specific variable is the primary
 * control now: if it's missing, callers get one clear, actionable
 * error instead of silently inheriting someone else's DATABASE_URL.
 * See .env.test.example and
 * docs/ops/post-launch-db-hardening.md section 46 (7th and 8th
 * follow-ups).
 */
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";

export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "getTestDatabaseUrl: TEST_DATABASE_URL is not set. Tests that need a direct DB " +
        "connection require it in .env.test.local -- see .env.test.example. " +
        "(DATABASE_URL is not an accepted fallback here, even if it happens to be set.)",
    );
  }
  assertLocalSafeDatabaseUrl(url);
  return url;
}
