-- 0056 RUN 3 of 3 -- PRODUCTION branch. Post-check.
-- Expected: one row -- column_present = t, is_nullable = NO, column_default = false,
--           app_role_can_insert = t, app_role_can_select = t. Send Claude a screenshot.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'citations' AND column_name = 'is_cache_hit') AS column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'is_cache_hit') AS is_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'is_cache_hit') AS column_default,
  has_column_privilege('visibleau_app', 'citations', 'is_cache_hit', 'INSERT') AS app_role_can_insert,
  has_column_privilege('visibleau_app', 'citations', 'is_cache_hit', 'SELECT') AS app_role_can_select;
