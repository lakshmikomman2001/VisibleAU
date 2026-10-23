-- 0096-action-items-latest-audit-dismiss-rollback.sql
-- "The Action Center shows each brand's latest audit only" (23 Oct), item 1
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone --
-- restores status/dismissed_reason/dismissed_at/updated_at from the
-- _backup_0096_action_items snapshot. Does NOT drop the backup table.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- mismatch_count = 0 (every restored row exactly matches the backup).
BEGIN;

UPDATE action_items ai
SET
  status = backup.status,
  dismissed_reason = backup.dismissed_reason,
  dismissed_at = backup.dismissed_at,
  updated_at = backup.updated_at
FROM _backup_0096_action_items backup
WHERE ai.id = backup.id;

COMMIT;

SELECT count(*) AS mismatch_count
FROM action_items ai
JOIN _backup_0096_action_items backup ON backup.id = ai.id
WHERE ai.status IS DISTINCT FROM backup.status
   OR ai.dismissed_reason IS DISTINCT FROM backup.dismissed_reason
   OR ai.dismissed_at IS DISTINCT FROM backup.dismissed_at;
