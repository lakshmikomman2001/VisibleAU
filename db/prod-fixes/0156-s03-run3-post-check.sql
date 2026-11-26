-- 0156-s03-run3-post-check.sql (27 Nov 2026, sprint S03 part 1): after run2. Every check must pass before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY (a read-only transaction, rolled back). Row-level security is checked from the catalogue (policies,
-- FORCE, grants), with no role switch: the production role can't SET ROLE visibleau_app (LLD amendment 80).
-- 6 result tabs.

BEGIN READ ONLY;

-- 1. organizations.question_packs: an integer, not null, default 0, with its CHECK.
--    Expected: 1 row: integer, NO, 0, check_exists t.
SELECT c.data_type, c.is_nullable, c.column_default,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conname = 'organizations_question_packs_check' AND conrelid = 'public.organizations'::regclass)
    AS check_exists
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'organizations' AND c.column_name = 'question_packs';

-- 2. brand_question_packs has RLS, FORCE RLS and four policies, each on app.current_org_id.
--    Expected: 1 row: rls t, forced t, policies 4, every_policy_uses_org t, commands {DELETE,INSERT,SELECT,UPDATE}.
SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies,
  (SELECT bool_and(coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%current_setting(''app.current_org_id''%')
     FROM pg_policies p WHERE p.tablename = c.relname) AS every_policy_uses_org,
  (SELECT array_agg(p.cmd ORDER BY p.cmd) FROM pg_policies p WHERE p.tablename = c.relname) AS commands
FROM pg_class c
WHERE c.oid = 'public.brand_question_packs'::regclass;

-- 3. visibleau_app's grants, and that it doesn't bypass RLS (so the policies above apply to it).
--    Expected: every column t, app_bypasses_rls f.
SELECT
  has_table_privilege('visibleau_app', 'brand_question_packs', 'SELECT,INSERT,UPDATE,DELETE') AS packs_dml,
  has_column_privilege('visibleau_app', 'organizations', 'question_packs', 'SELECT,UPDATE') AS org_packs_column,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'visibleau_app') AS app_bypasses_rls;

-- 4. What run2 wrote. Expected: workspaces = run1's check 3, workspaces_not_0 = 0, packs_rows = 0.
SELECT
  (SELECT count(*) FROM organizations) AS workspaces,
  (SELECT count(*) FROM organizations WHERE question_packs <> 0) AS workspaces_not_0,
  (SELECT count(*) FROM brand_question_packs) AS packs_rows;

-- 5. A brand's or a workspace's delete takes its packs row (ON DELETE CASCADE, confdeltype 'c').
--    Expected: 2 rows, brands c, organizations c.
SELECT confrelid::regclass AS refers_to, confdeltype::text AS on_delete
FROM pg_constraint
WHERE conrelid = 'public.brand_question_packs'::regclass AND contype = 'f'
ORDER BY 1;

-- 6. The packs CHECK (packs >= 0) is there. Expected: 1 row.
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.brand_question_packs'::regclass AND contype = 'c';

ROLLBACK;
