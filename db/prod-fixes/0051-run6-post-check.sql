-- 0051 RUN 6 of 6 -- PRODUCTION branch. Post-check.
-- Expected: excess_rows = 0, new_constraint_present = t, old_constraint_still_present = f.
-- Send Claude a screenshot.

SELECT
  (SELECT count(*) - count(DISTINCT (vendor, cidr)) FROM ai_bot_ip_ranges) AS excess_rows, -- expect 0
  (EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_unique'
             AND conrelid = 'ai_bot_ip_ranges'::regclass)) AS new_constraint_present, -- expect true
  (EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_version_hash_key'
             AND conrelid = 'ai_bot_ip_ranges'::regclass)) AS old_constraint_still_present; -- expect false
