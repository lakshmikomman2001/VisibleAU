// RLS DISABLED: global seed table — no organization_id.
// Cross-tenant prompt volume estimates seeded from internal audit history (visibleau_corpus)
// and optionally enriched with Google Trends AU data. No org-private data.
import { date, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const promptVolumeEstimates = pgTable(
  "prompt_volume_estimates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: text("market_code").notNull(),
    vertical: text("vertical").notNull(),
    topic: text("topic").notNull(),
    category: text("category").notNull(),
    estimatedMonthlyVolume: integer("estimated_monthly_volume"),
    volumeTrend: text("volume_trend"),
    confidence: text("confidence").notNull(),
    dataSource: text("data_source").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueMarketVerticalTopicPeriod: unique().on(table.marketCode, table.vertical, table.topic, table.periodStart),
  }),
);
