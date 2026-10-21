-- 0086-brand-directory-listings-run3-post-check.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part C)
--
-- PRODUCTION branch. Run on its own, as one editor submission.
-- READ-ONLY. Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: table_present = t, rls_enabled = t, rls_forced = t,
-- policy_count = 4, app_role_has_all_four_privileges = t,
-- unique_constraint_present = t, no_rows_yet = t (a brand-new table --
-- any row here before the owner-confirmation UI even ships would be
-- unexplained).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'brand_directory_listings'
  ) AS table_present,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'brand_directory_listings') AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'brand_directory_listings') AS rls_forced,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'brand_directory_listings') AS policy_count,
  (
    SELECT count(DISTINCT privilege_type) = 4
    FROM information_schema.role_table_grants
    WHERE table_name = 'brand_directory_listings'
      AND grantee = 'visibleau_app'
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) AS app_role_has_all_four_privileges,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'brand_directory_listings'::regclass AND contype = 'u'
  ) AS unique_constraint_present,
  (SELECT count(*) = 0 FROM brand_directory_listings) AS no_rows_yet;
