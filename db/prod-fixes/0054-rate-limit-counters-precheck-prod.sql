-- 0054-rate-limit-counters-precheck-prod.sql (task #46, 17th/19th follow-ups)
-- PRODUCTION branch. Run on its own, as one editor submission.
--
-- Read-only. Run BEFORE 0054-rate-limit-counters-run1-apply.sql.
-- Expected result: table_missing_as_expected = t. Confirms the table is
-- really missing.
SELECT
  (NOT EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'rate_limit_counters')) AS table_missing_as_expected;
