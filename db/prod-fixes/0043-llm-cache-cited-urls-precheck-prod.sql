-- READ-ONLY precheck for migration 0038 (llm_response_cache.cited_urls).
-- Run this against prod BEFORE applying
-- 0043-llm-cache-cited-urls-apply-prod.sql. Nothing in this file writes
-- anything. NOT run from Claude Code.
--
-- IMPORTANT -- apply-before-deploy, not just recommended: lib/llm/cache.ts's
-- getCached() does `.select().from(llmResponseCache)` and setCached()
-- does `.insert(llmResponseCache).values({...})`, both schema-aware via
-- Drizzle -- once the app code (citedUrls column added to the schema)
-- ships, EVERY cache read/write for EVERY engine references this
-- column. Both functions are now wrapped to degrade gracefully (cache
-- miss / response not cached, logged) if the column is missing rather
-- than breaking the audit -- see docs/ops/post-launch-db-hardening.md
-- section 43 -- but caching silently stops working for every engine
-- until this migration lands, not just Perplexity. Apply first.

-- 1. Does llm_response_cache.cited_urls already exist?
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'llm_response_cache' AND column_name = 'cited_urls';

-- 2. Context only: current cache table size (informational, not acted on).
SELECT count(*) AS total_cached_rows FROM llm_response_cache;
