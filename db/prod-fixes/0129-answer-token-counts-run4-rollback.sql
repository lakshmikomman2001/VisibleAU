-- 0129-answer-token-counts-run4-rollback.sql (Vunnara, 7 Nov, methodology
-- v2.2 part 7)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that writes the columns has been rolled back --
-- both audit runners insert citations.llm_input_tokens and
-- citations.llm_output_tokens, so dropping them while that code is live
-- fails every answer with 42703.
--
-- Dropping the columns loses each answer's own token counts since run2
-- (diag-0121 then estimates from characters again). Nothing else reads them.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then both *_present = f.
BEGIN;

ALTER TABLE citations DROP COLUMN IF EXISTS llm_input_tokens;
ALTER TABLE citations DROP COLUMN IF EXISTS llm_output_tokens;

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
