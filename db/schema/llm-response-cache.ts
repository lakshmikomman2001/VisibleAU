import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// RLS intentionally DISABLED — this is a cross-tenant prompt→response memoization cache.
// Key = sha256(prompt + model). Prompts embed brand-specific content (name, domain, queries),
// so different brands always produce different keys. Even a same-brand collision across orgs
// is safe: the cached value is generic LLM output (public model knowledge), not org-private data.
// Reviewed 2026-07-01; see docs/go-live-checklist.md item 8.
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
