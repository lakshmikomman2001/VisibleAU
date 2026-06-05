import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const llmResponseCache = pgTable("llm_response_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  cacheKey: text("cache_key").unique().notNull(),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  response: text("response").notNull(),
  tokensUsed: integer("tokens_used").notNull(),
  costEstimateUsd: numeric("cost_estimate_usd", { precision: 10, scale: 6 }).notNull(),
  hitCount: integer("hit_count").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
