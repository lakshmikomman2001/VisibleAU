-- 0091-citations-mention-verification-rollback.sql (Vunnara, 21 Oct,
-- "audit reliability", Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission. Only
-- safe to run if the app code that writes AND reads
-- mention_verification has already been rolled back first -- dropping
-- the column while lib/audit/run-audit-inline.ts / inngest/functions/
-- run-audit.ts still insert into it explicitly, or while lib/scoring/
-- resolve-audit-dimensions.ts still reads it, would 42703 (column
-- does not exist) on the very next audit run / audit or brand page
-- view. Once the app code is rolled back: safe, no FK/index
-- dependents -- every reader already treats NULL as "not classified,
-- count as before this hotfix", which is exactly what dropping the
-- column (then re-adding it fresh, if ever needed) would also produce.
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- column_present = f.
ALTER TABLE citations DROP CONSTRAINT IF EXISTS citations_mention_verification_check;
ALTER TABLE citations DROP COLUMN IF EXISTS mention_verification;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'mention_verification'
  ) AS column_present;
