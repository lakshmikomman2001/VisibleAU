import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Task #46 (17th follow-up): a Postgres-backed fallback fixed-window
 * counter for cost-incurring public endpoints, used only when the shared
 * Upstash/Redis limiter (lib/sample-audit/rate-limit.ts) is unconfigured
 * -- see that file's isAvailable()/checkRateLimit() for why "fail open"
 * is not acceptable for a route that triggers real paid LLM calls.
 *
 * `bucketKey` already encodes the window (e.g.
 * `sample-audit-create:<sha256(ip+salt)>:<windowStartISO>`), so a plain
 * UNIQUE constraint on it alone is enough to make a new window a new row
 * -- no composite key needed. Global/platform-wide (no organization_id):
 * this counts anonymous callers by IP, not by tenant.
 */
export const rateLimitCounters = pgTable("rate_limit_counters", {
  id: uuid("id").primaryKey().defaultRandom(),
  bucketKey: text("bucket_key").notNull().unique(),
  count: integer("count").notNull().default(1),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
