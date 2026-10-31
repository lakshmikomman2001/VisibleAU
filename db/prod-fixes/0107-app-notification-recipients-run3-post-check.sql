-- 0107-app-notification-recipients-run3-post-check.sql
-- B1 (Sri, 31 Oct): admins invited from another org get the org's
-- notification emails
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission, AFTER run2-apply.sql (before or after the push). Changes no
-- data: it fills one TEMPORARY table, which disappears with the editor
-- session. Sri-authorized only. NOT run from Claude Code.
--
-- It calls the function under each org's context in turn -- every open
-- org, and every closed one -- and compares what comes back with the
-- org's accepted, active owner/admin members read directly (the editor's
-- role bypasses RLS). Counts only; no addresses.
--
-- Expected result: the last tab, every row's result is PASS (a NOTICE
-- that schema "pg_temp" does not exist is fine the first time in a
-- session). Any FAIL: send Claude the rows. After the rollback file, this
-- file errors (function does not exist) -- expected.
DROP TABLE IF EXISTS pg_temp._0107_check;
CREATE TEMP TABLE _0107_check (
  org_id uuid,
  org_open boolean,
  expected_count int,
  returned_count int,
  matches boolean,
  rows_not_members int
);

DO $$
DECLARE
  o record;
  expected_ids uuid[];
  returned_ids uuid[];
BEGIN
  FOR o IN SELECT id, deleted_at IS NULL AS open FROM organizations LOOP
    PERFORM set_config('app.current_org_id', o.id::text, true);
    SELECT coalesce(array_agg(m.user_id ORDER BY m.user_id), '{}')
    INTO expected_ids
    FROM org_members m JOIN users u ON u.id = m.user_id
    WHERE o.open
      AND m.organization_id = o.id
      AND m.role IN ('owner', 'admin') AND m.is_active AND m.accepted_at IS NOT NULL
      AND position('@' IN u.email) > 0
      AND lower(btrim(u.email)) <> 'pending@sync.local';
    SELECT coalesce(array_agg(r.user_id ORDER BY r.user_id), '{}')
    INTO returned_ids
    FROM public.app_notification_recipients() r;
    INSERT INTO _0107_check VALUES (
      o.id, o.open, cardinality(expected_ids), cardinality(returned_ids),
      expected_ids = returned_ids,
      (SELECT count(*) FROM unnest(returned_ids) AS g(user_id)
       WHERE NOT EXISTS (
         SELECT 1 FROM org_members m WHERE m.organization_id = o.id AND m.user_id = g.user_id))
    );
  END LOOP;
  PERFORM set_config('app.current_org_id', '', true);
END $$;

WITH fn AS (
  SELECT p.oid, p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig, p.proacl::text[] AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'app_notification_recipients'
),
checks AS (
  SELECT 1 AS ord, 'the function exists, is SECURITY DEFINER, and pins search_path' AS check_name,
    1::bigint AS expected,
    (SELECT count(*) FROM fn WHERE prosecdef
       AND proconfig = ARRAY['search_path=pg_catalog, pg_temp']) AS actual
  UNION ALL
  SELECT 2, 'its owner is visibleau_notification_reader', 1,
    (SELECT count(*) FROM fn WHERE owner = 'visibleau_notification_reader')
  UNION ALL
  SELECT 3, 'the owner role: no login, superuser, BYPASSRLS, CREATEROLE, CREATEDB or replication', 1,
    (SELECT count(*) FROM pg_roles WHERE rolname = 'visibleau_notification_reader'
       AND NOT (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  UNION ALL
  SELECT 4, 'the owner can read exactly nine columns (organizations id, deleted_at; org_members 5; users id, email)', 9,
    (SELECT count(*) FROM information_schema.column_privileges
     WHERE grantee = 'visibleau_notification_reader' AND privilege_type = 'SELECT')
  UNION ALL
  SELECT 5, 'the owner holds no table-wide privilege and no CREATE on schema public', 0,
    (SELECT count(*) FROM information_schema.table_privileges WHERE grantee = 'visibleau_notification_reader')
    + (SELECT count(*) FROM pg_namespace n, aclexplode(n.nspacl) a
       WHERE n.nspname = 'public' AND a.grantee = 'visibleau_notification_reader'::regrole
         AND a.privilege_type = 'CREATE')
  UNION ALL
  SELECT 6, 'visibleau_app can execute it', 1,
    (SELECT count(*) FROM fn WHERE has_function_privilege('visibleau_app', fn.oid, 'EXECUTE'))
  UNION ALL
  SELECT 7, 'PUBLIC cannot execute it', 0,
    (SELECT count(*) FROM fn, unnest(fn.acl) AS a(entry) WHERE a.entry LIKE '=%')
  UNION ALL
  SELECT 8, 'the extra users policy: SELECT only, for the owner role only', 1,
    (SELECT count(*) FROM pg_policy
     WHERE polrelid = 'public.users'::regclass AND polname = 'users_notification_recipients_select'
       AND polcmd = 'r' AND polroles = ARRAY['visibleau_notification_reader'::regrole::oid])
  UNION ALL
  SELECT 9, 'with no org context it returns 0 rows', 0,
    (SELECT count(*) FROM public.app_notification_recipients())
  UNION ALL
  SELECT 10, 'open orgs checked (more than 0)', 1,
    (SELECT least(count(*), 1) FROM _0107_check WHERE org_open)
  UNION ALL
  SELECT 11, 'open orgs where it returns other than exactly the org''s owners and admins', 0,
    (SELECT count(*) FROM _0107_check WHERE org_open AND NOT matches)
  UNION ALL
  SELECT 12, 'rows returned for someone who isn''t a member of the context org', 0,
    (SELECT coalesce(sum(rows_not_members), 0) FROM _0107_check)
  UNION ALL
  SELECT 13, 'rows returned under a closed org''s context', 0,
    (SELECT coalesce(sum(returned_count), 0) FROM _0107_check WHERE NOT org_open)
)
SELECT
  check_name,
  expected,
  actual,
  CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY ord;
