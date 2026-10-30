-- 0103-placeholder-profile-email-run2-apply.sql
-- "Create workspace" answered 404 "Org not found" (30 Oct): optional repair
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql, and AFTER the push.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Gives each backed-up profile row its account's real address, and its
-- name when the row's is empty -- what /api/auth/sync-user would have
-- written. Touches only the rows in _backup_0103_placeholder_profiles
-- that still hold the placeholder; never changes a row's workspace,
-- role or id, never deletes.
--
-- Expected result: "Statement executed successfully" on the UPDATE tab,
-- then one row with updated_row_count = backup_row_count.
BEGIN;

UPDATE users p
SET
  email = a.email,
  name = CASE WHEN coalesce(p.name, '') = '' THEN a.name ELSE p.name END,
  updated_at = now()
FROM _backup_0103_placeholder_profiles backup, auth_users a
WHERE p.id = backup.id
  AND a.id = p.clerk_user_id
  AND p.email = 'pending@sync.local';

COMMIT;

SELECT
  (SELECT count(*) FROM _backup_0103_placeholder_profiles) AS backup_row_count,
  (SELECT count(*)
   FROM users p
   JOIN _backup_0103_placeholder_profiles backup ON backup.id = p.id
   JOIN auth_users a ON a.id = p.clerk_user_id
   WHERE p.email = a.email) AS updated_row_count;
