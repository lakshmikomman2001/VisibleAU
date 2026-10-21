-- 0089-engine-call-failures-run1-precheck.sql (Vunnara, 21 Oct,
-- "audit reliability", Part A)
--
-- PRODUCTION branch. Run on its own, as one editor submission.
-- READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE pushing the code
-- that reads/writes this table (new table -- apply before push, same
-- as every other additive schema change).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Mirrors db/migrations/0089_engine_call_failures.sql exactly.
--
-- Expected result: table_present = f.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'engine_call_failures'
  ) AS table_present;
