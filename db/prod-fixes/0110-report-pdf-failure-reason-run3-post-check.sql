-- 0110-report-pdf-failure-reason-run3-post-check.sql (Vunnara, 1 Nov,
-- "PDF reports fail on production", part 2)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql
-- finishes. READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row -- column_present = t, is_nullable = YES,
-- column_default = NULL, check_present = t, app_role_can_select = t,
-- app_role_can_update = t (the "Try again" route clears the column as the
-- app role), and all_rows_null = t (nothing has failed under the new code
-- yet).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'pdf_failure_reason'
  ) AS column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'generated_reports' AND column_name = 'pdf_failure_reason') AS is_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'generated_reports' AND column_name = 'pdf_failure_reason') AS column_default,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_reports_pdf_failure_reason_check'
  ) AS check_present,
  has_column_privilege('visibleau_app', 'generated_reports', 'pdf_failure_reason', 'SELECT') AS app_role_can_select,
  has_column_privilege('visibleau_app', 'generated_reports', 'pdf_failure_reason', 'UPDATE') AS app_role_can_update,
  (SELECT count(*) = count(*) FILTER (WHERE pdf_failure_reason IS NULL) FROM generated_reports) AS all_rows_null;
