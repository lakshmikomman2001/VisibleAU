-- 0054-rate-limit-counters-run2-post-check.sql (task #46, 17th/19th follow-ups)
-- PRODUCTION branch. Run on its own, after
-- 0054-rate-limit-counters-run1-apply.sql finishes.
--
-- Expected result: one row, table_exists = t, unique_constraint_present = t,
-- index_present = t. If any is f, do not push -- send Claude a screenshot.
SELECT
  (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limit_counters')) AS table_exists,
  (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limit_counters_bucket_key_key')) AS unique_constraint_present,
  (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'rate_limit_counters_window_start_idx')) AS index_present;
