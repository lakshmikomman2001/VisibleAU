-- 0107-app-notification-recipients-run1-precheck.sql
-- B1 (Sri, 31 Oct): admins invited from another org get the org's
-- notification emails
--
-- PRODUCTION branch (br-ancient-tooth). READ-ONLY: one SELECT. Run FIRST,
-- then run2 -- both BEFORE the push: the new code calls
-- app_notification_recipients() on every notification email, and fails
-- (so the email isn't sent) while it doesn't exist. Mirrors
-- db/migrations/0107_app_notification_recipients.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row --
--   runner_can_create_roles = t (run2 creates a role)
--   runner_bypasses_rls = t (run3 compares against a direct read)
--   app_role_ok = t (visibleau_app: can log in, no superuser, no BYPASSRLS)
--   rls_forced_on_users_members_orgs = t
--   reader_role_exists, function_exists, policy_exists = f (t if run2 already ran)
--   invited_admins_who_start_getting_emails = how many accepted, active
--     owner/admin memberships of open orgs belong to a profile that lives
--     in another org: the people B1 adds, once the push is live
--   owner_admin_memberships_open_orgs = all such memberships, for scale.
-- Counts only; no addresses.
SELECT
  current_setting('server_version') AS server_version,
  (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) AS runner_can_create_roles,
  (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS runner_bypasses_rls,
  EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'visibleau_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) AS app_role_ok,
  (SELECT count(*) = 3 FROM pg_class
   WHERE oid IN ('public.users'::regclass, 'public.org_members'::regclass, 'public.organizations'::regclass)
     AND relrowsecurity AND relforcerowsecurity) AS rls_forced_on_users_members_orgs,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_notification_reader') AS reader_role_exists,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_notification_recipients'
  ) AS function_exists,
  EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.users'::regclass AND polname = 'users_notification_recipients_select'
  ) AS policy_exists,
  (SELECT count(*) FROM org_members m
   JOIN organizations o ON o.id = m.organization_id
   JOIN users u ON u.id = m.user_id
   WHERE o.deleted_at IS NULL
     AND m.role IN ('owner', 'admin') AND m.is_active AND m.accepted_at IS NOT NULL
     AND u.organization_id <> m.organization_id
     AND position('@' IN u.email) > 0
     AND lower(btrim(u.email)) <> 'pending@sync.local') AS invited_admins_who_start_getting_emails,
  (SELECT count(*) FROM org_members m
   JOIN organizations o ON o.id = m.organization_id
   WHERE o.deleted_at IS NULL
     AND m.role IN ('owner', 'admin') AND m.is_active AND m.accepted_at IS NOT NULL)
    AS owner_admin_memberships_open_orgs;
