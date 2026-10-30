-- 0103-placeholder-profile-email-rollback.sql
-- "Create workspace" answered 404 "Org not found" (30 Oct): optional repair
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- restores
-- email, name and updated_at from the _backup_0103_placeholder_profiles
-- snapshot. Does NOT drop the backup table. Sri-authorized only. NOT run
-- from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- mismatch_count = 0 (every restored row exactly matches the backup).
BEGIN;

UPDATE users p
SET
  email = backup.email,
  name = backup.name,
  updated_at = backup.updated_at
FROM _backup_0103_placeholder_profiles backup
WHERE p.id = backup.id;

COMMIT;

SELECT count(*) AS mismatch_count
FROM users p
JOIN _backup_0103_placeholder_profiles backup ON backup.id = p.id
WHERE p.email IS DISTINCT FROM backup.email
   OR p.name IS DISTINCT FROM backup.name;
