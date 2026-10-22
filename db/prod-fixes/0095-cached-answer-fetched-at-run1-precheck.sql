-- 0095-cached-answer-fetched-at-run1-precheck.sql (Vunnara, 23 Oct,
-- "The cached-answer age must be the age of the content", item 2)
--
-- PRODUCTION branch. READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that reads/writes these columns -- that code would
-- throw (column does not exist) on its first real call if this
-- hasn't been applied yet.
-- Mirrors db/migrations/0095_cached_answer_fetched_at.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row, both column_present = f, both row counts
-- = <whatever's really there>.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_response_cache' AND column_name = 'fetched_at'
  ) AS llm_response_cache_fetched_at_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'cached_from_at'
  ) AS citations_cached_from_at_present,
  (SELECT count(*) FROM llm_response_cache) AS llm_response_cache_total_rows,
  (SELECT count(*) FROM citations) AS citations_total_rows;
