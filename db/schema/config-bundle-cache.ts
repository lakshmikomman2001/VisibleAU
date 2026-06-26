// RLS DISABLED: global seed config table — no organization_id. Read by platform
// services for all tenants. Precedent: citability_methods, validation_corpus_results.
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const configBundleCache = pgTable(
  "config_bundle_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: text("market_code").notNull(),
    locale: text("locale").notNull(),
    segment: text("segment").notNull(),
    bundleVersion: integer("bundle_version").notNull(),
    configDigest: text("config_digest").notNull(),
    resolvedConfig: jsonb("resolved_config").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueMarketLocaleSegmentVersion: uniqueIndex("config_bundle_unique_version").on(
      table.marketCode,
      table.locale,
      table.segment,
      table.bundleVersion,
    ),
    oneActivePerTuple: uniqueIndex("config_bundle_one_active")
      .on(table.marketCode, table.locale, table.segment)
      .where(sql`is_active = true`),
  }),
);
