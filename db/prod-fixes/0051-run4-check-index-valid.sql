-- 0051 RUN 4 of 6 -- PRODUCTION branch. Index validity check.
-- Expected: one row, indisvalid = t (TRUE). If it shows f, STOP and send Claude a screenshot.

SELECT indexrelid::regclass AS index_name, indisvalid
FROM pg_index WHERE indexrelid = 'ai_bot_ip_ranges_vendor_cidr_unique'::regclass;
