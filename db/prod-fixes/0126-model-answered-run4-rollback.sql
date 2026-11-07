-- 0126-model-answered-run4-rollback.sql (Vunnara, 7 Nov, Sri's decision 6)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that writes the columns has been rolled back -- both
-- audit runners insert citations.llm_model_answered, and the LLM cache writes
-- llm_response_cache.model_answered, so dropping them while that code is live
-- fails every answer with 42703.
--
-- Dropping the columns loses which model answered each audit since run2 (the
-- audit pages and PDFs then stop flagging those audits). Nothing else reads
-- them.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then both *_present = f.
BEGIN;

ALTER TABLE citations DROP COLUMN IF EXISTS llm_model_answered;
ALTER TABLE llm_response_cache DROP COLUMN IF EXISTS model_answered;

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
