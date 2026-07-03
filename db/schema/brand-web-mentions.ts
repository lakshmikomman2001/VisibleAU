// RLS ENABLED: tenant data — organization_id scoped.
import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const brandWebMentions = pgTable(
  "brand_web_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").references(() => brands.id).notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
    marketCode: text("market_code").notNull().default("AU_EN"),
    sourcePlatform: text("source_platform").notNull(),
    sourceUrl: text("source_url").notNull(),
    subreddit: text("subreddit"),
    mentionText: text("mention_text"),
    mentionSentiment: text("mention_sentiment"),
    upvotes: integer("upvotes"),
    isTopComment: boolean("is_top_comment"),
    threadRecencyDays: integer("thread_recency_days"),
    isIndexedByGoogle: boolean("is_indexed_by_google"),
    engineCitationSeen: text("engine_citation_seen"),
    verticalMatch: boolean("vertical_match"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandIdx: index("brand_mentions_brand_idx").on(table.brandId, table.detectedAt),
    platformIdx: index("brand_mentions_platform_idx").on(table.brandId, table.sourcePlatform, table.detectedAt),
    marketIdx: index("brand_mentions_market_idx").on(table.brandId, table.marketCode, table.detectedAt),
  }),
);
