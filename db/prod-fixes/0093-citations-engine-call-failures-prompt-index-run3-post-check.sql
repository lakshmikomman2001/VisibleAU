-- 0093-citations-engine-call-failures-prompt-index-run3-post-check.sql
-- (Vunnara, 22 Oct, "audits time out on Vercel", item 2)
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row -- both column_present / index_present
-- pairs = t, both is_nullable = YES, both column_default = NULL,
-- app_role_can_insert/select = t for both tables,
-- all_existing_rows_null = t for both (nothing has prompt_index yet
-- -- only audits run after this deploys will).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'prompt_index'
  ) AS citations_column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'prompt_index') AS citations_is_nullable,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'citations' AND indexname = 'citations_audit_engine_prompt_idx_unique_idx'
  ) AS citations_index_present,
  has_column_privilege('visibleau_app', 'citations', 'prompt_index', 'INSERT') AS citations_app_role_can_insert,
  has_column_privilege('visibleau_app', 'citations', 'prompt_index', 'SELECT') AS citations_app_role_can_select,
  (SELECT count(*) = 0 FROM citations WHERE prompt_index IS NOT NULL) AS citations_all_existing_rows_null,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engine_call_failures' AND column_name = 'prompt_index'
  ) AS failures_column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'prompt_index') AS failures_is_nullable,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'engine_call_failures'
      AND indexname = 'engine_call_failures_audit_engine_prompt_idx_unique_idx'
  ) AS failures_index_present,
  has_column_privilege('visibleau_app', 'engine_call_failures', 'prompt_index', 'INSERT') AS failures_app_role_can_insert,
  has_column_privilege('visibleau_app', 'engine_call_failures', 'prompt_index', 'SELECT') AS failures_app_role_can_select,
  (SELECT count(*) = 0 FROM engine_call_failures WHERE prompt_index IS NOT NULL) AS failures_all_existing_rows_null;
