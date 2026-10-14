-- 0052-app-role-apply-prod.sql (task #46, 13th follow-up)
--
-- Run on the PRODUCTION branch in the Neon SQL editor, ONLY if
-- 0052-precheck-prod.sql's row 1 shows STOP (visibleau_app missing, or
-- superuser, or BYPASSRLS) -- per docs/ops/neon-vercel-deploy-runbook.md,
-- this role is believed to already exist correctly on real prod as of
-- 2026-09-18. This file is the contingency, not the expected path.
--
-- NO PASSWORD IN THIS FILE. If creating the role fresh, set its password
-- in the Neon console (Roles -> visibleau_app -> Reset password) right
-- after running this, before anything tries to connect as it.
--
-- Mirrors scripts/db/tier1a-app-role.sql's local grants exactly, minus
-- the dev-only hardcoded password.
--
-- *** Run connected as the project owner role (neondb_owner), never as
-- visibleau_app itself *** -- migrations and DDL, including this file,
-- must keep running as the owner role. If visibleau_app could run DDL
-- it wouldn't need this file's grants to be this narrow.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'visibleau_app') THEN
    CREATE ROLE visibleau_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    -- Role already exists (the expected case) -- just confirm/restate
    -- its attributes rather than skip, in case something drifted.
    ALTER ROLE visibleau_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO visibleau_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO visibleau_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO visibleau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO visibleau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO visibleau_app;

-- FORCE ROW LEVEL SECURITY on every RLS-enabled table -- without FORCE,
-- the table OWNER (never visibleau_app here, but worth stating plainly)
-- bypasses RLS even with it enabled.
DO $$ DECLARE tbl text; BEGIN
  FOR tbl IN
    SELECT relname::text FROM pg_class
    WHERE relrowsecurity = true AND relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

COMMIT;

-- Post-check -- expect rolsuper=false, rolbypassrls=false, rolcanlogin=true,
-- and (if this run just created the role) a password NOT yet set --
-- the app cannot connect until Sri sets one in the Neon console.
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, (rolpassword IS NOT NULL) AS has_password
FROM pg_roles WHERE rolname = 'visibleau_app';

-- Next steps (not run by this file):
--   1. Set/rotate visibleau_app's password in the Neon console.
--   2. Rotate Vercel's DATABASE_URL (and Inngest's SERVICE_DATABASE_URL,
--      if it's ever pointed at a privileged role by mistake -- it should
--      stay on neondb_owner by design) to use visibleau_app.
--   3. Redeploy.
--   4. Re-check via Part B: open /api/admin/db-role-check on the live
--      site, or Vercel -> Logs, searching "db_role_check" -- confirm
--      connection=app shows super=false, bypassrls=false.
