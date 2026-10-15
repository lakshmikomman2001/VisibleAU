-- 0051 RUN 5 of 6 -- PRODUCTION branch. Adopt the index as the UNIQUE constraint.
-- Expected: Statement executed successfully. Then run 0051-run6.

ALTER TABLE ai_bot_ip_ranges
  ADD CONSTRAINT ai_bot_ip_ranges_vendor_cidr_unique
  UNIQUE USING INDEX ai_bot_ip_ranges_vendor_cidr_unique;
