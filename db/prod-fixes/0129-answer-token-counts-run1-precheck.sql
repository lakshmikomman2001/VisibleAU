-- 0129-answer-token-counts-run1-precheck.sql (Vunnara, 7 Nov, methodology
-- v2.2 part 7: store each answer's input and output tokens)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that writes the columns -- both audit runners insert
-- citations.llm_input_tokens and citations.llm_output_tokens, so every
-- answer would fail (42703, column does not exist) until run2 has run.
-- Mirrors db/migrations/0129_answer_token_counts.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration only adds two nullable columns; no existing
-- value changes.
--
-- Expected result: one row -- both *_present = f, and the row count.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_input_tokens'
  ) AS llm_input_tokens_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_output_tokens'
  ) AS llm_output_tokens_present,
  (SELECT count(*) FROM citations) AS citations_rows;
