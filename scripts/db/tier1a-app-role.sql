-- VisibleAU Tier 1A — Non-superuser app role for RLS enforcement
-- Idempotent: safe to re-run
--
-- Creates a dedicated `visibleau_app` role for API/user-request queries.
-- This role is NOSUPERUSER + NOBYPASSRLS, so RLS policies actually enforce.
-- The `postgres` superuser (SERVICE_DATABASE_URL) is preserved for Inngest
-- background jobs that legitimately operate across orgs.

BEGIN;

-- 1. Create the app role (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'visibleau_app') THEN
    CREATE ROLE visibleau_app LOGIN PASSWORD 'visibleau_app_dev'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2. Least-privilege grants: DML on all public tables, no DDL
GRANT USAGE ON SCHEMA public TO visibleau_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO visibleau_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO visibleau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO visibleau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO visibleau_app;

-- 3. FORCE ROW LEVEL SECURITY on all RLS-enabled tenant tables
-- Even table owners must go through policies (defense-in-depth)
DO $$ DECLARE tbl text; BEGIN
  FOR tbl IN
    SELECT relname::text FROM pg_class
    WHERE relrowsecurity = true AND relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- 4. Disable RLS on llm_response_cache (system cache, no org scoping column)
ALTER TABLE llm_response_cache DISABLE ROW LEVEL SECURITY;

COMMIT;
