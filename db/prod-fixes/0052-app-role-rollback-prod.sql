-- 0052-app-role-rollback-prod.sql (task #46, 13th follow-up)
--
-- Run on the PRODUCTION branch in the Neon SQL editor, only to undo
-- 0052-apply-prod.sql.
--
-- *** DO NOT RUN THIS WHILE DATABASE_URL (or SERVICE_DATABASE_URL) IS
-- STILL POINTED AT visibleau_app *** -- revoking its grants, or dropping
-- it, while the live app is connected as it will break every
-- RLS-enforced request immediately. Rotate Vercel's env var back to the
-- previous role FIRST, redeploy, confirm the app is healthy on the old
-- role, THEN run this.
--
-- This only reverts the grants/FORCE-RLS this task added. It does not
-- (and should not) un-FORCE row-level security on tables that had it
-- forced before this ever ran -- there is no record here of which
-- tables that was, so this intentionally leaves FORCE ROW LEVEL
-- SECURITY in place on all of them; forcing it is strictly safer,
-- never a correctness regression, for any table that already has a
-- correct policy.

BEGIN;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM visibleau_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM visibleau_app;
REVOKE USAGE ON SCHEMA public FROM visibleau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM visibleau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM visibleau_app;

COMMIT;

-- This intentionally does NOT `DROP ROLE visibleau_app` -- dropping a
-- role that owns grants/dependencies elsewhere, or that something is
-- still mid-connection as, can fail or orphan references. If the role
-- itself (not just its grants) genuinely needs to go, do that as its
-- own separate, deliberate step after confirming nothing references it:
--   DROP ROLE visibleau_app;

-- Confirm: should show zero table grants.
SELECT count(*) AS remaining_table_grants
FROM information_schema.role_table_grants
WHERE grantee = 'visibleau_app' AND table_schema = 'public';
