-- 0094-audit-cost-snapshots-source-run1-precheck.sql (Vunnara, 22
-- Oct, "Inngest: fit within the 5 concurrent steps of the free
-- plan", item 3)
--
-- PRODUCTION branch. READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that calls BudgetPolicyService.record() with a
-- non-'audit' source and relies on ON CONFLICT (audit_id, source) --
-- that code would throw "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" on its first real call if
-- this hasn't been applied yet.
-- Mirrors db/migrations/0094_audit_cost_snapshots_source.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row, column_present = f,
-- old_constraint_present = t (migration 0092's (audit_id)-only
-- constraint, still in place -- this run replaces it),
-- new_index_present = f, total_rows = <whatever's really there>.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_cost_snapshots' AND column_name = 'source'
  ) AS column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_unique_idx'
  ) AS old_constraint_present,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_cost_snapshots' AND indexname = 'audit_cost_audit_id_source_unique_idx'
  ) AS new_index_present,
  (SELECT count(*) FROM audit_cost_snapshots) AS total_rows;
