-- 0123-stop-reason-run3-post-check.sql (Vunnara, 6 Nov, "Mention
-- detection", part 2)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: one row --
--   both *_nullable = YES, both *_default = NULL,
--   error_class_check_valid = t and the check lists 'incomplete_answer',
--   app_role_* = t (the runners insert these columns as the app role),
--   citations_with_stop_reason = 0 and incomplete_answer_failures = 0
--   (nothing writes them until the new code deploys).
-- Run again after the push and an audit: citations_with_stop_reason > 0;
-- truncated_answers and incomplete_answer_failures say how often each
-- happens (both expected to be rare).
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'stop_reason') AS stop_reason_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'stop_reason') AS stop_reason_default,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'answer_truncated') AS answer_truncated_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'answer_truncated') AS answer_truncated_default,
  (SELECT convalidated FROM pg_constraint
   WHERE conname = 'engine_call_failures_error_class_check') AS error_class_check_valid,
  (SELECT pg_get_constraintdef(oid) LIKE '%incomplete_answer%' FROM pg_constraint
   WHERE conname = 'engine_call_failures_error_class_check') AS check_lists_incomplete_answer,
  has_column_privilege('visibleau_app', 'citations', 'stop_reason', 'SELECT') AS app_role_stop_reason_select,
  has_column_privilege('visibleau_app', 'citations', 'stop_reason', 'INSERT') AS app_role_stop_reason_insert,
  has_column_privilege('visibleau_app', 'citations', 'answer_truncated', 'SELECT') AS app_role_truncated_select,
  has_column_privilege('visibleau_app', 'citations', 'answer_truncated', 'INSERT') AS app_role_truncated_insert,
  (SELECT count(*) FROM citations WHERE stop_reason IS NOT NULL) AS citations_with_stop_reason,
  (SELECT count(*) FROM citations WHERE answer_truncated) AS truncated_answers,
  (SELECT count(*) FROM engine_call_failures WHERE error_class = 'incomplete_answer') AS incomplete_answer_failures;
