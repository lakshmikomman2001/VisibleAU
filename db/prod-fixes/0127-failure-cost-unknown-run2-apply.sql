-- 0127-failure-cost-unknown-run2-apply.sql (Vunnara, 7 Nov, methodology v2.2
-- part 4)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Run
-- AFTER run1-precheck.sql, and BEFORE the push. DROP NOT NULL is
-- metadata-only (no row rewrite, no table scan).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then one row with
-- cost_usd_nullable = YES and the default still 0.
BEGIN;

ALTER TABLE engine_call_failures ALTER COLUMN cost_usd DROP NOT NULL;

COMMIT;

SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_usd') AS cost_usd_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_usd') AS cost_usd_default;
