-- 0127-failure-cost-unknown-run4-rollback.sql (Vunnara, 7 Nov, methodology
-- v2.2 part 4)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that records an unknown cost has been rolled back:
-- that code inserts cost_usd = NULL for a timed-out call, which fails (23502)
-- once NOT NULL is back.
--
-- It puts $0 back on every row whose cost is unknown (NOT NULL can't hold
-- NULL): those calls read as costing nothing again, as before this change.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "UPDATE n", "Statement executed successfully", then
-- cost_usd_nullable = NO and unknown_cost_rows = 0.
BEGIN;

UPDATE engine_call_failures SET cost_usd = 0 WHERE cost_usd IS NULL;
ALTER TABLE engine_call_failures ALTER COLUMN cost_usd SET NOT NULL;

COMMIT;

SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_usd') AS cost_usd_nullable,
  (SELECT count(*) FROM engine_call_failures WHERE cost_usd IS NULL) AS unknown_cost_rows;
