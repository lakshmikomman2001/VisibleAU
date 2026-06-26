// RLS DISABLED: global seed config table — no organization_id.
import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const providerMarketCapabilities = pgTable(
  "provider_market_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerKey: text("provider_key").notNull(),
    modelKey: text("model_key").notNull(),
    marketCode: text("market_code").notNull(),
    locale: text("locale").notNull(),
    supportsWebRetrieval: boolean("supports_web_retrieval").notNull().default(false),
    supportsCitations: boolean("supports_citations").notNull().default(false),
    supportsLocationContext: boolean("supports_location_context").notNull().default(false),
    supportsQueryFanOut: boolean("supports_query_fan_out").notNull().default(false),
    maxFanOutSubQueries: integer("max_fan_out_sub_queries").notNull().default(12),
    maxContextTokens: integer("max_context_tokens"),
    averageLatencyMs: integer("average_latency_ms"),
    estimatedCostPer1kCents: numeric("estimated_cost_per_1k_cents", {
      precision: 8,
      scale: 4,
    }),
    isEnabled: boolean("is_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueProviderModelMarketLocale: uniqueIndex("provider_capability_unique").on(
      table.providerKey,
      table.modelKey,
      table.marketCode,
      table.locale,
    ),
  }),
);
