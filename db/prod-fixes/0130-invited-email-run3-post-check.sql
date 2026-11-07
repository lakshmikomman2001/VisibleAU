-- 0130-invited-email-run3-post-check.sql (Vunnara, 7 Nov, team follow-ups
-- item 1)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql (and run2b,
-- if Sri runs it). READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: one row -- invited_email_nullable = YES,
-- invited_email_default = NULL, app_role_* = t (the invite route writes it and
-- the members list reads it as the app role, through prod-fix 0052's table
-- grants), and with_address = 0 (or run2b's count if it ran).
-- Run again after the push and an invite: with_address grows by one for each
-- invite sent or re-sent. Counts only.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'invited_email') AS invited_email_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'invited_email') AS invited_email_default,
  has_column_privilege('visibleau_app', 'org_members', 'invited_email', 'SELECT') AS app_role_select,
  has_column_privilege('visibleau_app', 'org_members', 'invited_email', 'INSERT') AS app_role_insert,
  has_column_privilege('visibleau_app', 'org_members', 'invited_email', 'UPDATE') AS app_role_update,
  (SELECT count(*) FROM org_members WHERE invited_email IS NOT NULL) AS with_address,
  (SELECT count(*) FROM org_members WHERE accepted_at IS NULL AND invited_email IS NULL)
    AS pending_without_address;
