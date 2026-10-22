-- 0095-cached-answer-fetched-at-run3-post-check.sql (Vunnara, 23 Oct,
-- "The cached-answer age must be the age of the content", item 2)
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row -- both column_present = t, both
-- is_nullable = YES, both column_default = NULL (no default -- NULL
-- is the correct, honest starting state for every existing row),
-- app_role_can_insert/select on both = t, and
-- all_existing_rows_null = t (every pre-existing row has no fetched_
-- at / cached_from_at yet -- correct; they'll only ever be set going
-- forward, on the next cache write or audit run).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_response_cache' AND column_name = 'fetched_at'
  ) AS fetched_at_column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'llm_response_cache' AND column_name = 'fetched_at') AS fetched_at_is_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'llm_response_cache' AND column_name = 'fetched_at') AS fetched_at_default,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'cached_from_at'
  ) AS cached_from_at_column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'cached_from_at') AS cached_from_at_is_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'cached_from_at') AS cached_from_at_default,
  has_column_privilege('visibleau_app', 'llm_response_cache', 'fetched_at', 'INSERT') AS app_role_can_insert_fetched_at,
  has_column_privilege('visibleau_app', 'llm_response_cache', 'fetched_at', 'SELECT') AS app_role_can_select_fetched_at,
  has_column_privilege('visibleau_app', 'citations', 'cached_from_at', 'INSERT') AS app_role_can_insert_cached_from_at,
  has_column_privilege('visibleau_app', 'citations', 'cached_from_at', 'SELECT') AS app_role_can_select_cached_from_at,
  (SELECT count(*) = count(*) FILTER (WHERE fetched_at IS NULL) FROM llm_response_cache) AS all_existing_llm_cache_rows_null,
  (SELECT count(*) = count(*) FILTER (WHERE cached_from_at IS NULL) FROM citations) AS all_existing_citations_rows_null;
