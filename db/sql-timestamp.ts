import { type SQL, sql } from "drizzle-orm";

/**
 * 13 Nov (part 6): a point in time inside a raw `sql` template. Drizzle's postgres-js driver switches off
 * postgres-js's own date serializers (drizzle-orm/postgres-js/driver.js: the timestamp types' serializers are
 * "transparent"), so a Date interpolated as `${date}` reaches Postgres as Date.prototype.toString() --
 * local-time text ("Thu Nov 13 2026 09:00:00 GMT+1100 ..."), which fails or, worse, parses in the server's
 * zone. Found in 6376c8a (the alert dedupe's cutoff). Vercel runs in UTC, local and test runs in Sydney.
 * Always this, never `${date}`: tests/unit/db/no-date-in-raw-sql.test.ts fails on a Date in a `sql` template.
 */
export function sqlTimestamp(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}
