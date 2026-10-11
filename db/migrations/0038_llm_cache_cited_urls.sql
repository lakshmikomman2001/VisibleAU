-- Migration 0038: add llm_response_cache.cited_urls.
--
-- Task #43: Perplexity's real cited sources (citations/search_results,
-- structured URLs the API returns alongside the answer text) were being
-- discarded entirely -- CompleteOutput had no field for them, and even
-- after adding one, a cache hit on a replay within the 48h TTL would
-- still have silently dropped them, since llm_response_cache only
-- stored response/tokensUsed/costEstimateUsd. This column lets a cached
-- hit carry its structured sources forward, not just its text.
--
-- Nullable, additive, no backfill: rows written before this column
-- existed (and any engine without structured sources) simply have no
-- value here, which app code (lib/llm/cache.ts) already treats as "no
-- structured sources for this cached response" -- functionally
-- identical to their current behaviour.
--
-- See docs/ops/post-launch-db-hardening.md section 43.

BEGIN;

ALTER TABLE llm_response_cache
  ADD COLUMN IF NOT EXISTS cited_urls jsonb;

COMMIT;
