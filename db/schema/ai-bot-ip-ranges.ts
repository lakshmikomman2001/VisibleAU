import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const aiBotIpRanges = pgTable("ai_bot_ip_ranges", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendor: text("vendor").notNull(),
  cidr: text("cidr").notNull(),
  sourceUrl: text("source_url").notNull(),
  versionHash: text("version_hash").notNull(),
  isCurrent: boolean("is_current").notNull().default(true),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  cidrIdx: index("ai_bot_ip_ranges_lookup_idx").on(t.vendor, t.isCurrent),
}));
