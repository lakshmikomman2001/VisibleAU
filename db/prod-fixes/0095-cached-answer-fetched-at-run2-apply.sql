-- 0095-cached-answer-fetched-at-run2-apply.sql (Vunnara, 23 Oct,
-- "The cached-answer age must be the age of the content", item 2)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql, and BEFORE the push (the
-- new code reads/writes these columns from the moment it deploys).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Both ADD COLUMNs are metadata-only (nullable, no default) -- a
-- fast, single metadata change on both tables, no per-row rewrite.
-- No backfill: see migration 0095's own comment for why a derived
-- backfill (expires_at minus an assumed TTL) would be a genuine guess
-- for most existing llm_response_cache rows, and citations.cached_
-- from_at has no historical source at all (the concept didn't exist
-- before this column).
--
-- Expected result: "Statement executed successfully" on every tab.
BEGIN;

ALTER TABLE llm_response_cache
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

ALTER TABLE citations
  ADD COLUMN IF NOT EXISTS cached_from_at timestamptz;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_response_cache' AND column_name = 'fetched_at'
  ) AS llm_response_cache_fetched_at_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'cached_from_at'
  ) AS citations_cached_from_at_present;
