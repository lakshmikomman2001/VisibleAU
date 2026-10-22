-- 0094-audit-cost-snapshots-source-run3-post-check.sql (Vunnara, 22
-- Oct, "Inngest: fit within the 5 concurrent steps of the free
-- plan", item 3)
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row -- column_present = t, is_nullable = NO,
-- column_default mentions 'audit', new_constraint_present = t,
-- old_constraint_gone = t, app_role_can_insert/select = t,
-- all_existing_rows_default_audit = t (every pre-existing row,
-- written before this column existed, is 'audit' -- correct, since
-- every one of them really was the audit's own cost).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_cost_snapshots' AND column_name = 'source'
  ) AS column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'audit_cost_snapshots' AND column_name = 'source') AS is_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'audit_cost_snapshots' AND column_name = 'source') AS column_default,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_source_unique_idx'
  ) AS new_constraint_present,
  NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_unique_idx'
  ) AS old_constraint_gone,
  has_column_privilege('visibleau_app', 'audit_cost_snapshots', 'source', 'INSERT') AS app_role_can_insert,
  has_column_privilege('visibleau_app', 'audit_cost_snapshots', 'source', 'SELECT') AS app_role_can_select,
  (SELECT count(*) = count(*) FILTER (WHERE source = 'audit') FROM audit_cost_snapshots) AS all_existing_rows_default_audit;
