import { integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// RLS intentionally DISABLED — this is a cross-tenant prompt→response memoization cache.
// Key = sha256(prompt + model + groundingMode + methodologyVersion) -- see lib/llm/cache.ts's
// makeKey() (Part G.4 added the latter two fields; this comment previously described the
// original 2-field shape). Prompts embed brand-specific content (name, domain, queries), so
// different brands almost always produce different keys; even a same-brand collision across
// orgs is safe: the cached value is generic LLM output (public model knowledge), not
// org-private data. Reviewed 2026-07-01; see docs/go-live-checklist.md item 8.
export const llmResponseCache = pgTable("llm_response_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  cacheKey: text("cache_key").unique().notNull(),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  response: text("response").notNull(),
  tokensUsed: integer("tokens_used").notNull(),
  costEstimateUsd: numeric("cost_estimate_usd", { precision: 10, scale: 6 }).notNull(),
  hitCount: integer("hit_count").default(1).notNull(),
  // Task #43: structured citation URLs (e.g. Perplexity's citations/
  // search_results) persisted alongside the cached response text, so a
  // cache hit on a replay within the 48h TTL still carries them --
  // without this, a cached Perplexity response would silently drop its
  // real sources on every replay. Nullable: rows written before this
  // column existed (and any engine without structured sources) simply
  // have no value here. Migration 0038 (apply-before-deploy; see
  // db/prod-fixes/0043-llm-cache-cited-urls-*-prod.sql). See
  // docs/ops/post-launch-db-hardening.md section 43.
  citedUrls: jsonb("cited_urls"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // "The cached-answer age must be the age of the content" (23 Oct),
  // item 2 -- WHEN this content was actually produced, set on every
  // INSERT and on every onConflictDoUpdate refresh (lib/llm/cache.ts's
  // setCached()). Distinct from createdAt (the row's first-ever
  // creation, frozen forever) -- a row refreshed many times over its
  // life has a createdAt from its very first fetch, long before most
  // of its actual content; fetchedAt always reflects the CURRENT
  // content. Nullable: existing rows, written before this column
  // existed, get NULL (never backfilled with a guess -- see migration
  // 0095's own comment for why) until they're next refreshed.
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
});
