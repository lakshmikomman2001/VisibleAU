-- 0096-action-items-latest-audit-dismiss-run1-backup.sql
-- "The Action Center shows each brand's latest audit only" (23 Oct), item 1
--
-- PRODUCTION branch. Run on its own, as one editor submission. Run
-- AFTER the push (depends on the dismiss-on-new-audit code already
-- being deployed -- see run2-apply.sql's own header) and AFTER
-- reviewing diag-0096's output. Sri-authorized only. NOT run from
-- Claude Code.
--
-- Snapshots the affected columns' CURRENT values into
-- _backup_0096_action_items (Neon's editor can't \copy) -- drop it
-- later (run4) once run3's post-check looks right and no rollback is
-- needed. Same "latest complete audit per brand" rule as diag-0096 and
-- lib/recommendations/latest-audit-scope.ts.
--
-- Expected result: "Statement executed successfully" on the CREATE
-- TABLE tab, then one row with backup_row_count matching diag-0096's
-- total_open_will_be_dismissed exactly.
CREATE TABLE _backup_0096_action_items AS
WITH latest_complete AS (
  SELECT DISTINCT ON (brand_id) brand_id, id AS audit_id
  FROM audits
  WHERE status = 'complete'
  ORDER BY brand_id, completed_at DESC, id DESC
)
SELECT ai.id, ai.status, ai.dismissed_reason, ai.dismissed_at, ai.updated_at
FROM action_items ai
JOIN latest_complete lc ON lc.brand_id = ai.brand_id
WHERE ai.status = 'open'
  AND ai.audit_id <> lc.audit_id;

SELECT count(*) AS backup_row_count FROM _backup_0096_action_items;
