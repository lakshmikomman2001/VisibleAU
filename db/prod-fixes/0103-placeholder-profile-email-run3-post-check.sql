-- 0103-placeholder-profile-email-run3-post-check.sql
-- "Create workspace" answered 404 "Org not found" (30 Oct): optional repair
--
-- PRODUCTION branch. READ-ONLY. Run after run2-apply.sql. Sri-authorized
-- only. NOT run from Claude Code.
--
-- Expected result: one row, still_placeholder_with_account = 0 and
-- not_matching_account = 0. (Placeholder rows with no matching account,
-- if diag-0103 section 6 showed any, are left as they were and aren't
-- counted here.)
SELECT
  (SELECT count(*)
   FROM users p
   JOIN auth_users a ON a.id = p.clerk_user_id
   WHERE p.email = 'pending@sync.local') AS still_placeholder_with_account,
  (SELECT count(*)
   FROM users p
   JOIN _backup_0103_placeholder_profiles backup ON backup.id = p.id
   JOIN auth_users a ON a.id = p.clerk_user_id
   WHERE p.email IS DISTINCT FROM a.email) AS not_matching_account;
