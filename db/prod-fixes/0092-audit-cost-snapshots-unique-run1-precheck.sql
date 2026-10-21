-- 0092-audit-cost-snapshots-unique-run1-precheck.sql (Vunnara, 22
-- Oct, "make the daily spend cap real", item 1)
--
-- PRODUCTION branch. READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that calls BudgetPolicyService.record() from the
-- Inngest happy path (inngest/functions/run-audit.ts) and relies on
-- ON CONFLICT (audit_id) DO NOTHING for idempotency -- that code path
-- would throw "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification" on its very first real audit if this
-- hasn't been applied yet.
-- Mirrors db/migrations/0092_audit_cost_snapshots_unique_audit_id.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row, index_present = f, constraint_present = f,
-- duplicate_audit_id_groups = 0, total_rows = <whatever's really
-- there>. If duplicate_audit_id_groups is anything other than 0, STOP
-- -- do not run run2-apply.sql (CREATE UNIQUE INDEX will fail outright
-- against real duplicates, and the right fix depends on which rows
-- are the legitimate ones, which this script can't decide for you).
SELECT
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_cost_snapshots' AND indexname = 'audit_cost_audit_id_unique_idx'
  ) AS index_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_unique_idx'
  ) AS constraint_present,
  (SELECT count(*) FROM (
    SELECT audit_id FROM audit_cost_snapshots GROUP BY audit_id HAVING count(*) > 1
  ) dupes) AS duplicate_audit_id_groups,
  (SELECT count(*) FROM audit_cost_snapshots) AS total_rows;
