-- 0054 RUN 2 -- PRODUCTION branch. Post-check.
-- Expected: one row, ALL columns = t. If any is f, do not push -- send Claude a screenshot.
SELECT
  (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limit_counters')) AS table_exists,
  (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limit_counters_bucket_key_key')) AS unique_constraint_present,
  (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'rate_limit_counters_window_start_idx')) AS index_present,
  has_table_privilege('visibleau_app', 'rate_limit_counters', 'SELECT')
    AND has_table_privilege('visibleau_app', 'rate_limit_counters', 'INSERT')
    AND has_table_privilege('visibleau_app', 'rate_limit_counters', 'UPDATE')
    AND has_table_privilege('visibleau_app', 'rate_limit_counters', 'DELETE') AS app_role_can_use_it;
