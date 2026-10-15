-- 0054-rate-limit-counters-precheck-prod.sql (task #46, 17th follow-up)
--
-- Read-only. Run on the PRODUCTION branch (Neon SQL editor) BEFORE
-- 0054-...-apply-prod.sql. Confirms the table is really missing.
SELECT
  (NOT EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'rate_limit_counters')) AS table_missing_as_expected;
