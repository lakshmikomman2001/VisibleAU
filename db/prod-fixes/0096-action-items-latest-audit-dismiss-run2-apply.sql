-- 0096-action-items-latest-audit-dismiss-run2-apply.sql
-- "The Action Center shows each brand's latest audit only" (23 Oct), item 1
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql's backup_row_count matches,
-- and AFTER the push (the dismiss-on-new-audit code -- lib/
-- recommendations/persist.ts, called from both
-- inngest/functions/generate-recommendations.ts and
-- lib/audit/run-audit-inline.ts -- must already be deployed; running
-- this before the push would dismiss rows the still-live old code
-- could immediately recreate on the next audit). Sri-authorized only.
-- NOT run from Claude Code.
--
-- Marks dismissed every brand's OPEN action item whose audit is not
-- that brand's own latest COMPLETE audit -- same reason string the app
-- code now writes going forward ('Replaced by a newer audit'), so a
-- row dismissed by this one-time catch-up is indistinguishable from
-- one the running app dismisses itself. Never touches in_progress or
-- done items (status = 'open' only), never deletes a row, and never
-- touches a brand with zero complete audits (the JOIN against
-- latest_complete has no row to match, so nothing for that brand is
-- selected at all).
--
-- Expected result: "Statement executed successfully" on the UPDATE
-- tab, then one row with backup_row_count == updated_row_count.
BEGIN;

WITH latest_complete AS (
  SELECT DISTINCT ON (brand_id) brand_id, id AS audit_id
  FROM audits
  WHERE status = 'complete'
  ORDER BY brand_id, completed_at DESC, id DESC
)
UPDATE action_items ai
SET
  status = 'dismissed',
  dismissed_reason = 'Replaced by a newer audit',
  dismissed_at = now(),
  updated_at = now()
FROM latest_complete lc
WHERE lc.brand_id = ai.brand_id
  AND ai.status = 'open'
  AND ai.audit_id <> lc.audit_id;

COMMIT;

SELECT
  (SELECT count(*) FROM _backup_0096_action_items) AS backup_row_count,
  (
    SELECT count(*) FROM action_items
    WHERE status = 'dismissed'
      AND dismissed_reason = 'Replaced by a newer audit'
      AND id IN (SELECT id FROM _backup_0096_action_items)
  ) AS updated_row_count;
