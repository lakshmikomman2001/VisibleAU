-- 0069-action-items-confidence-basis-rollback.sql (task #46, "fix:
-- stored value contradicting its own CI", follow-up #1)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only safe to run BEFORE the code that reads/writes
-- confidence_basis is deployed -- once that code is live, dropping this
-- column breaks every query that selects it. If the deploy already
-- happened, do not run this; re-run 0069-run2-apply.sql instead (it's
-- idempotent, ADD COLUMN IF NOT EXISTS).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- column_present = f.
BEGIN;
ALTER TABLE action_items DROP COLUMN IF EXISTS confidence_basis;
COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'action_items' AND column_name = 'confidence_basis'
  ) AS column_present;
