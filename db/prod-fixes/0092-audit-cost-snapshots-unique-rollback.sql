-- 0092-audit-cost-snapshots-unique-rollback.sql (Vunnara, 22 Oct,
-- "make the daily spend cap real", item 1)
--
-- PRODUCTION branch. Run on its own, as one editor submission. Only
-- safe to run if the app code that relies on this constraint has
-- already been rolled back first -- lib/platform/budget-policy.
-- service.ts's record() uses ON CONFLICT (audit_id) DO NOTHING, which
-- 42P10 ("there is no unique or exclusion constraint matching the ON
-- CONFLICT specification") the moment this is dropped while that code
-- is still live. Once the app code is rolled back: safe, no FK or
-- other dependents on this specific index/constraint (checked
-- pg_depend directly).
--
-- Recreates the old plain (non-unique) lookup index afterwards --
-- restores exactly the pre-migration-0092 shape, not a half state.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully" x3, then
-- constraint_present = f, unique_index_present = f,
-- old_index_present = t.
ALTER TABLE audit_cost_snapshots DROP CONSTRAINT IF EXISTS audit_cost_audit_id_unique_idx;
DROP INDEX IF EXISTS audit_cost_audit_id_unique_idx;
CREATE INDEX IF NOT EXISTS audit_cost_audit_id_idx ON audit_cost_snapshots (audit_id);

SELECT
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_unique_idx'
  ) AS constraint_present,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_cost_snapshots' AND indexname = 'audit_cost_audit_id_unique_idx'
  ) AS unique_index_present,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_cost_snapshots' AND indexname = 'audit_cost_audit_id_idx'
  ) AS old_index_present;
