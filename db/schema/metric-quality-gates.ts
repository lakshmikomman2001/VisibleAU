// RLS DISABLED: global seed config table — no organization_id.
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const metricQualityGates = pgTable(
  "metric_quality_gates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metricKey: text("metric_key").notNull(),
    marketCode: text("market_code").notNull(),
    minimumSamples: integer("minimum_samples").notNull(),
    minimumProviderCount: integer("minimum_provider_count").notNull().default(2),
    insufficientDataLabel: text("insufficient_data_label").notNull().default("Insufficient data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueMetricMarket: uniqueIndex("metric_quality_gate_unique").on(
      table.metricKey,
      table.marketCode,
    ),
  }),
);
