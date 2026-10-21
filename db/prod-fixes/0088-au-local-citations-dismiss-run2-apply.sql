-- 0088-au-local-citations-dismiss-run2-apply.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part E)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql's backup_row_count matches,
-- and AFTER the push (the directory-visibility rule must already be
-- the deployed code -- running this before the push would dismiss
-- rows the still-live au-local-citations rule could immediately
-- recreate on the next audit). Sri-authorized only. NOT run from
-- Claude Code.
--
-- Marks every non-dismissed au-local-citations action item dismissed
-- -- including 'done' ones: a row a user marked done against the old,
-- unreliable checker's claim isn't a real completed task either, so
-- leaving it "done" would still imply the old finding was trustworthy.
-- Never deletes a row (CLAUDE.md: prod data changes are additive/
-- corrective, never destructive).
--
-- Expected result: "Statement executed successfully" on the UPDATE
-- tab, then one row with backup_row_count == updated_row_count.
BEGIN;

UPDATE action_items
SET
  status = 'dismissed',
  dismissed_reason = 'Replaced: the earlier directory check was unreliable',
  dismissed_at = now(),
  updated_at = now()
WHERE recommendation_key = 'au-local-citations'
  AND status <> 'dismissed';

COMMIT;

SELECT
  (SELECT count(*) FROM _backup_0088_action_items) AS backup_row_count,
  (
    SELECT count(*) FROM action_items
    WHERE recommendation_key = 'au-local-citations'
      AND status = 'dismissed'
      AND dismissed_reason = 'Replaced: the earlier directory check was unreliable'
      AND id IN (SELECT id FROM _backup_0088_action_items)
  ) AS updated_row_count;
