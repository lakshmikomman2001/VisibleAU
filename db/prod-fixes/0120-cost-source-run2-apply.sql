-- 0120-cost-source-run2-apply.sql (Vunnara, 6 Nov, "Record costs from what
-- each provider actually reports", item 1)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql, and BEFORE the push (the new
-- runners write these columns on every answer from the moment they deploy).
-- Sri-authorized only. NOT run from Claude Code.
--
-- ADD COLUMN is metadata-only (nullable, no default): no row rewrite. Each
-- ADD CONSTRAINT ... CHECK reads its table once to validate (every row is
-- NULL, so it passes) while holding the table's lock -- an audit inserting
-- an answer at that moment waits for it, it doesn't fail.
--
-- Expected result: "Statement executed successfully", then one row with all
-- four values = t.
BEGIN;

ALTER TABLE citations ADD COLUMN IF NOT EXISTS llm_cost_source text;
DO $$ BEGIN
  ALTER TABLE citations
    ADD CONSTRAINT citations_llm_cost_source_check
    CHECK (llm_cost_source IN ('provider_reported', 'price_table'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE engine_call_failures ADD COLUMN IF NOT EXISTS cost_source text;
DO $$ BEGIN
  ALTER TABLE engine_call_failures
    ADD CONSTRAINT engine_call_failures_cost_source_check
    CHECK (cost_source IN ('provider_reported', 'price_table'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_cost_source'
  ) AS citations_column_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engine_call_failures' AND column_name = 'cost_source'
  ) AS failures_column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'citations_llm_cost_source_check'
  ) AS citations_check_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engine_call_failures_cost_source_check'
  ) AS failures_check_present;
