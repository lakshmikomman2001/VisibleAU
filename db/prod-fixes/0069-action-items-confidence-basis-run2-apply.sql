-- 0069-action-items-confidence-basis-run2-apply.sql (task #46, "fix:
-- stored value contradicting its own CI", follow-up #1)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql, BEFORE pushing the code that
-- reads/writes this column -- nullable, no default, metadata-only on
-- Postgres (no table rewrite, no lock contention). Mirrors migration
-- db/migrations/0046_action_items_confidence_basis.sql exactly.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then the final
-- SELECT's column_present = t, non_null_count = 0 (nothing can have
-- written this column before the code that writes it exists).
BEGIN;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS confidence_basis text;
COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'action_items' AND column_name = 'confidence_basis'
  ) AS column_present,
  (SELECT count(*) FROM action_items WHERE confidence_basis IS NOT NULL) AS non_null_count;
