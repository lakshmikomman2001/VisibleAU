-- 0091-citations-mention-verification-run1-precheck.sql (Vunnara, 21
-- Oct, "audit reliability", Part B)
--
-- PRODUCTION branch. READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that reads/writes this column (additive column --
-- apply before push, same as every other additive schema change).
-- Mirrors db/migrations/0091_citations_mention_verification.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row, column_present = f, constraint_present = f,
-- plus the citations row count.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'mention_verification'
  ) AS column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'citations_mention_verification_check'
  ) AS constraint_present,
  (SELECT count(*) FROM citations) AS total_citation_rows;
