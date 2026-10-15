-- 0051 RUN 3 of 6 -- PRODUCTION branch. Unique index, CONCURRENTLY -- must run ALONE.
-- Expected: Statement executed successfully. Then run 0051-run4.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ai_bot_ip_ranges_vendor_cidr_unique
  ON ai_bot_ip_ranges (vendor, cidr);
