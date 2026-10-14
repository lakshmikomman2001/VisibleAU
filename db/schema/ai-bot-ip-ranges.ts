import { boolean, cidr, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const aiBotIpRanges = pgTable(
  "ai_bot_ip_ranges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendor: text("vendor").notNull(),
    // Task #46 (10th follow-up): native cidr, not text -- migration 0024
    // already converts the live column (TEXT -> CIDR) and migration 0025's
    // dedup-adjacent GiST index (ai_bot_ip_ranges_cidr_idx) and the
    // crawler_logs_dedup_idx on the sibling table both only work against
    // a real cidr/inet column. Drizzle's cidr()/inet() are pure string
    // pass-throughs at the JS layer (no mapFromDriverValue/
    // mapToDriverValue override -- see node_modules/drizzle-orm/pg-core/
    // columns/cidr.js), so every existing read/write (raw ::cidr casts in
    // lib/agent-analytics/ip-ranges.ts, plain-string inserts) is
    // unaffected. See docs/ops/post-launch-db-hardening.md section 46
    // (10th follow-up).
    cidr: cidr("cidr").notNull(),
    sourceUrl: text("source_url").notNull(),
    versionHash: text("version_hash").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cidrIdx: index("ai_bot_ip_ranges_lookup_idx").on(t.vendor, t.isCurrent),
  }),
);
