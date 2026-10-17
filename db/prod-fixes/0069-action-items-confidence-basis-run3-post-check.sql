-- 0069-action-items-confidence-basis-run3-post-check.sql (task #46,
-- "fix: stored value contradicting its own CI", follow-up #1)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER run2-apply.sql -- and again after the next deploy that
-- actually writes this column, to confirm new recommendations start
-- carrying a real marker (non_null_count should start rising only after
-- that deploy, never before it).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result immediately after run2-apply (before any new deploy):
-- column_present = t, non_null_count = 0.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'action_items' AND column_name = 'confidence_basis'
  ) AS column_present,
  (SELECT count(*) FROM action_items WHERE confidence_basis IS NOT NULL) AS non_null_count,
  (SELECT count(*) FROM action_items) AS total_action_items_rows;
