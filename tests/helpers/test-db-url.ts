/**
 * Task #46 (7th follow-up): the one shared, env-driven way a test gets
 * a database URL to connect to directly (seeding/teardown via a raw
 * `postgres()` client, not through the app's own @/db/client). No
 * hardcoded database name lives here or in any caller -- the literal
 * lives in .env.test.local's TEST_DATABASE_URL (falling back to
 * DATABASE_URL, the same variable @/db/client itself reads), and every
 * resolved URL is run through the same guard scripts/db/local-db-guard.ts
 * uses for migrate-local.ts, so a test can never silently point at a
 * database named like prod or a neon.tech host. See
 * docs/ops/post-launch-db-hardening.md section 46 (7th follow-up).
 */
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";

export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "getTestDatabaseUrl: neither TEST_DATABASE_URL nor DATABASE_URL is set. " +
        "Tests that need a direct DB connection require one of these in .env.test.local.",
    );
  }
  assertLocalSafeDatabaseUrl(url);
  return url;
}
