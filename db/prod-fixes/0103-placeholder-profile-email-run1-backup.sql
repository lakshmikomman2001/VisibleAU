-- 0103-placeholder-profile-email-run1-backup.sql
-- "Create workspace" answered 404 "Org not found" (30 Oct): optional repair
--
-- SUPERSEDED by 0104-close-accidental-workspaces-* (31 Oct): its run2 fixes
-- these same placeholder rows. Run 0104 instead; don't run this as well.
--
-- PRODUCTION branch. Run on its own, as one editor submission. Run AFTER
-- the push (until then the old create hook can still write new
-- placeholder rows) and only if diag-0103 section 6 shows rows to fix.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Why: a sign-up whose last step failed left the account's profile row
-- (`users`) holding the placeholder 'pending@sync.local' instead of its
-- address -- the create hook wrote that, and /api/auth/sync-user (which
-- replaced it) is the step that 404'd. The account still signs in, but
-- it gets no emails (lib/email/recipients.ts skips the placeholder) and
-- its team list shows the placeholder. New sign-ups no longer write it.
--
-- Snapshots the rows the apply step will change into
-- _backup_0103_placeholder_profiles (Neon's editor can't \copy) -- drop
-- it later (run4) once run3's post-check looks right.
--
-- Expected result: "Statement executed successfully" on the CREATE TABLE
-- tab, then one row whose backup_row_count matches diag-0103 section 6's
-- second number ("... have a matching account").
CREATE TABLE _backup_0103_placeholder_profiles AS
SELECT p.id, p.email, p.name, p.updated_at
FROM users p
JOIN auth_users a ON a.id = p.clerk_user_id
WHERE p.email = 'pending@sync.local';

SELECT count(*) AS backup_row_count FROM _backup_0103_placeholder_profiles;
