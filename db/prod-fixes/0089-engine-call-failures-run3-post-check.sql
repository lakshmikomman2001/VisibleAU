-- 0089-engine-call-failures-run3-post-check.sql (Vunnara, 21 Oct,
-- "audit reliability", Part A)
--
-- PRODUCTION branch. Run on its own, as one editor submission.
-- READ-ONLY. Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: table_present = t, rls_enabled = t, rls_forced = t,
-- policy_count = 4, app_role_has_all_four_privileges = t,
-- no_rows_yet = t (a brand-new table -- any row here before the
-- deployed code can write one would be unexplained).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'engine_call_failures'
  ) AS table_present,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'engine_call_failures') AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'engine_call_failures') AS rls_forced,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'engine_call_failures') AS policy_count,
  (
    SELECT count(DISTINCT privilege_type) = 4
    FROM information_schema.role_table_grants
    WHERE table_name = 'engine_call_failures'
      AND grantee = 'visibleau_app'
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) AS app_role_has_all_four_privileges,
  (SELECT count(*) = 0 FROM engine_call_failures) AS no_rows_yet;
