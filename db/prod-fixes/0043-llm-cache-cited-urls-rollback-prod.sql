-- Rollback for 0043-llm-cache-cited-urls-apply-prod.sql / migration 0038.
--
-- Safe: drops only the new nullable column, no FK/index dependents.
-- App code already treats a missing citedUrls gracefully (getCached/
-- setCached in lib/llm/cache.ts degrade to cache-miss / not-cached on
-- any failure, including a missing column), so dropping this column
-- after the app code has shipped does not break caching -- it just
-- stops persisting structured sources across cache hits again, same as
-- before migration 0038.
--
-- Sri-authorized only. NOT run from Claude Code.

ALTER TABLE llm_response_cache
  DROP COLUMN IF EXISTS cited_urls;
