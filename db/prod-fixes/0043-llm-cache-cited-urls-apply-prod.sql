-- Applies migration 0038 to prod: adds llm_response_cache.cited_urls.
-- Verbatim-equivalent to db/migrations/0038_llm_cache_cited_urls.sql.
--
-- Sri-authorized only. NOT run from Claude Code.
-- Snapshot -> precheck -> apply -> re-precheck -> THEN deploy (push the
-- commit that adds citedUrls to the schema/app code). Additive, nullable
-- column -- low risk, but see the precheck file for why this one
-- specifically should land before the code ships rather than after.

BEGIN;

ALTER TABLE llm_response_cache
  ADD COLUMN IF NOT EXISTS cited_urls jsonb;

COMMIT;

-- Verify: re-run 0043-llm-cache-cited-urls-precheck-prod.sql's query 1
-- and confirm cited_urls now appears.
