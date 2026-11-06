-- 0120-cost-source-run4-rollback.sql (Vunnara, 6 Nov, "Record costs from what
-- each provider actually reports", item 1)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that writes the columns has been rolled back (both
-- audit runners) -- dropping them while that code is live fails every answer
-- of every audit with 42703 (column does not exist).
--
-- The columns are additive, so dropping them loses only the cost sources
-- recorded since run2; every cost itself (llm_cost_usd, cost_usd) stays.
-- Nothing was backed up, because no existing row changed.
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then both
-- *_present = f.
BEGIN;

ALTER TABLE citations DROP CONSTRAINT IF EXISTS citations_llm_cost_source_check;
ALTER TABLE citations DROP COLUMN IF EXISTS llm_cost_source;
ALTER TABLE engine_call_failures DROP CONSTRAINT IF EXISTS engine_call_failures_cost_source_check;
ALTER TABLE engine_call_failures DROP COLUMN IF EXISTS cost_source;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_cost_source'
  ) AS citations_column_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engine_call_failures' AND column_name = 'cost_source'
  ) AS failures_column_present;
