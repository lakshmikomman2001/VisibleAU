-- 0095-cached-answer-fetched-at-rollback.sql (Vunnara, 23 Oct, "The
-- cached-answer age must be the age of the content", item 2)
--
-- PRODUCTION branch. Run on its own, as one editor submission. Only
-- safe to run if the app code that reads/writes these columns
-- (lib/llm/cache.ts's getCached()/setCached(), inngest/functions/
-- run-audit.ts, lib/audit/run-audit-inline.ts, the audit detail page)
-- has already been rolled back first -- dropping either column while
-- that code still references it would 42703 (column does not exist)
-- on its next cache write or audit-page view.
--
-- Both columns are additive with no backfill, so dropping either one
-- loses nothing that existed before migration 0095 -- there is no
-- "restore the old shape" step needed beyond the DROP itself.
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully" x2, then both
-- column_present = f.
ALTER TABLE llm_response_cache DROP COLUMN IF EXISTS fetched_at;
ALTER TABLE citations DROP COLUMN IF EXISTS cached_from_at;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_response_cache' AND column_name = 'fetched_at'
  ) AS fetched_at_column_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'cached_from_at'
  ) AS cached_from_at_column_present;
