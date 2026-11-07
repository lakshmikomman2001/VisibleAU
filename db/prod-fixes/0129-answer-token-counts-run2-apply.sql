-- 0129-answer-token-counts-run2-apply.sql (Vunnara, 7 Nov, methodology v2.2
-- part 7)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Run
-- AFTER run1-precheck.sql, and BEFORE the push. ADD COLUMN with no default is
-- metadata-only (no row rewrite).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then one row with both
-- *_present = t.
BEGIN;

ALTER TABLE citations ADD COLUMN IF NOT EXISTS llm_input_tokens integer;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS llm_output_tokens integer;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_input_tokens'
  ) AS llm_input_tokens_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_output_tokens'
  ) AS llm_output_tokens_present;
