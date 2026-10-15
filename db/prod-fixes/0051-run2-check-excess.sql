-- 0051 RUN 2 of 6 -- PRODUCTION branch. Check after run 1.
-- Expected: excess_rows_remaining = 0. Then run 0051-run3.

SELECT count(*) - count(DISTINCT (vendor, cidr)) AS excess_rows_remaining FROM ai_bot_ip_ranges;
