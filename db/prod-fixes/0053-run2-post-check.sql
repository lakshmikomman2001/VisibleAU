-- 0053 RUN 2 of 2 -- PRODUCTION branch. Post-check.
-- Expected: is_nullable = NO, remaining_nulls = 0, column_default mentions "now() + '7 days'".
-- Send Claude a screenshot.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'expires_at') AS is_nullable,
  (SELECT count(*) FROM org_members WHERE expires_at IS NULL) AS remaining_nulls,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'expires_at') AS column_default;
