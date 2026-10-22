-- 0094-audit-cost-snapshots-source-rollback.sql (Vunnara, 22 Oct,
-- "Inngest: fit within the 5 concurrent steps of the free plan",
-- item 3)
--
-- PRODUCTION branch. Run on its own, as one editor submission. Only
-- safe to run if the app code that writes a non-'audit' source (or
-- relies on the (audit_id, source) ON CONFLICT target) has already
-- been rolled back first -- dropping the column while inngest/
-- functions/simulate-query-fan-out.ts or run-comparison-prompts.ts
-- still call BudgetPolicyService.record() with a source argument
-- would 42703 (column does not exist) / 42P10 (no matching unique
-- constraint) on their next run.
--
-- Recreates migration 0092's original (audit_id)-only constraint
-- afterwards -- restores exactly that pre-migration-0094 shape, not
-- a half state. Only safe if every audit_cost_snapshots row is
-- STILL source = 'audit' at rollback time (true immediately after
-- rolling back the app code, before any post-audit function could
-- have written a different source again) -- if any non-'audit' rows
-- exist, delete or reassign them first; recreating a plain
-- (audit_id) unique constraint will otherwise fail outright on a
-- real duplicate audit_id.
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully" x3, then
-- column_present = f, old_constraint_present = t.
ALTER TABLE audit_cost_snapshots DROP CONSTRAINT IF EXISTS audit_cost_audit_id_source_unique_idx;
ALTER TABLE audit_cost_snapshots DROP COLUMN IF EXISTS source;

CREATE UNIQUE INDEX IF NOT EXISTS audit_cost_audit_id_unique_idx ON audit_cost_snapshots (audit_id);
DO $$ BEGIN
  ALTER TABLE audit_cost_snapshots
    ADD CONSTRAINT audit_cost_audit_id_unique_idx
    UNIQUE USING INDEX audit_cost_audit_id_unique_idx;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_cost_snapshots' AND column_name = 'source'
  ) AS column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_unique_idx'
  ) AS old_constraint_present;
