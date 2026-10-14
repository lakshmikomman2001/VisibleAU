-- 0052-app-role-precheck-prod.sql (task #46, 13th follow-up)
--
-- Read-only. Run on the production branch in the Neon SQL editor.
--
-- Context: docs/ops/neon-vercel-deploy-runbook.md section 1/4.2 already
-- documents (as of 2026-09-18, independently verified during a real
-- incident) that Vercel's DATABASE_URL uses `visibleau_app`
-- (NOSUPERUSER, NOBYPASSRLS, fully RLS-enforced) and SERVICE_DATABASE_URL
-- uses `neondb_owner` (privileged, by design -- Inngest background jobs
-- that legitimately cross orgs). This file re-confirms that's still true
-- today, rather than trusting a point-in-time doc -- if it's drifted,
-- Part C's runbook (docs/ops/post-launch-db-hardening.md section 46,
-- 13th follow-up) and 0052-apply below are the fix.

SELECT check_name, result, detail FROM (
  SELECT 1 AS seq, 'visibleau_app role exists and has the right attributes' AS check_name,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app' AND NOT rolsuper AND NOT rolbypassrls AND rolcanlogin
    ) THEN 'PASS' ELSE 'STOP' END AS result,
    COALESCE(
      (SELECT 'rolsuper=' || rolsuper::text || ' rolbypassrls=' || rolbypassrls::text || ' rolcanlogin=' || rolcanlogin::text
       FROM pg_roles WHERE rolname = 'visibleau_app'),
      'role does not exist'
    ) AS detail

  UNION ALL

  SELECT 2, 'neondb_owner role exists and is privileged (by design)', 'INFO',
    COALESCE(
      (SELECT 'rolsuper=' || rolsuper::text || ' rolbypassrls=' || rolbypassrls::text
       FROM pg_roles WHERE rolname = 'neondb_owner'),
      'role does not exist (unexpected on Neon)'
    )

  UNION ALL

  SELECT 3, 'visibleau_app has USAGE on schema public', 'INFO',
    -- information_schema.role_usage_grants does not cover schema-level
    -- USAGE (only domains/sequences/types) -- has_schema_privilege() is
    -- the correct check.
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app') THEN 'role does not exist'
    ELSE has_schema_privilege('visibleau_app', 'public', 'USAGE')::text END

  UNION ALL

  SELECT 4, 'visibleau_app has DML (SELECT/INSERT/UPDATE/DELETE) on public tables -- count', 'INFO',
    (SELECT count(DISTINCT table_name)::text
     FROM information_schema.role_table_grants
     WHERE grantee = 'visibleau_app' AND table_schema = 'public') || ' table(s)'

  UNION ALL

  SELECT 5, 'visibleau_app owns any table (it should own none -- ownership bypasses FORCE ROW LEVEL SECURITY for the owner)',
    'INFO',
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app') THEN 'role does not exist'
    ELSE COALESCE(
      (SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'visibleau_app')),
      'none'
    ) END

  UNION ALL

  SELECT 6, 'current_user running this precheck (the Neon editor''s own role -- not what Vercel/Inngest use)', 'INFO',
    current_user
) AS checks
ORDER BY seq;
