-- 0069-action-items-confidence-basis-run1-precheck.sql (task #46, "fix:
-- stored value contradicting its own CI", follow-up #1)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run BEFORE 0069-action-items-confidence-basis-run2-apply.sql, and
-- BEFORE pushing the code that reads/writes confidence_basis (apply
-- this migration before the deploy, per the project's additive-migration
-- convention -- live code today doesn't know this column exists, so
-- adding it first is always safe).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: column_present = f.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'action_items' AND column_name = 'confidence_basis'
  ) AS column_present,
  (SELECT count(*) FROM action_items) AS total_action_items_rows;
