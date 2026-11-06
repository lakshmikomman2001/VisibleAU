-- 0120-cost-source-run3-post-check.sql (Vunnara, 6 Nov, "Record costs from
-- what each provider actually reports", item 1)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: one row --
--   both *_nullable = YES, both *_default = NULL,
--   both *_check_valid = t,
--   app_role_* = t (the runners insert these columns as the app role),
--   citations_with_source = 0 and failures_with_source = 0 (nothing writes
--   them until the new code deploys).
-- Run again after the push and an audit: *_with_source > 0, and
-- provider_reported_citations > 0 once an audit with Perplexity has run.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'llm_cost_source') AS citations_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'llm_cost_source') AS citations_default,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_source') AS failures_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_source') AS failures_default,
  (SELECT convalidated FROM pg_constraint
   WHERE conname = 'citations_llm_cost_source_check') AS citations_check_valid,
  (SELECT convalidated FROM pg_constraint
   WHERE conname = 'engine_call_failures_cost_source_check') AS failures_check_valid,
  has_column_privilege('visibleau_app', 'citations', 'llm_cost_source', 'SELECT') AS app_role_citations_select,
  has_column_privilege('visibleau_app', 'citations', 'llm_cost_source', 'INSERT') AS app_role_citations_insert,
  has_column_privilege('visibleau_app', 'engine_call_failures', 'cost_source', 'SELECT') AS app_role_failures_select,
  has_column_privilege('visibleau_app', 'engine_call_failures', 'cost_source', 'INSERT') AS app_role_failures_insert,
  (SELECT count(*) FROM citations WHERE llm_cost_source IS NOT NULL) AS citations_with_source,
  (SELECT count(*) FROM engine_call_failures WHERE cost_source IS NOT NULL) AS failures_with_source,
  (SELECT count(*) FROM citations WHERE llm_cost_source = 'provider_reported') AS provider_reported_citations;
