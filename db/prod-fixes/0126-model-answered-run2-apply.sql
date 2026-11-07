-- 0126-model-answered-run2-apply.sql (Vunnara, 7 Nov, Sri's decision 6)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Run
-- AFTER run1-precheck.sql, and BEFORE the push. ADD COLUMN with no default is
-- metadata-only (no row rewrite).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then one row with both
-- *_present = t.
BEGIN;

ALTER TABLE citations ADD COLUMN IF NOT EXISTS llm_model_answered text;
ALTER TABLE llm_response_cache ADD COLUMN IF NOT EXISTS model_answered text;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_model_answered'
  ) AS citations_llm_model_answered_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_response_cache' AND column_name = 'model_answered'
  ) AS cache_model_answered_present;
