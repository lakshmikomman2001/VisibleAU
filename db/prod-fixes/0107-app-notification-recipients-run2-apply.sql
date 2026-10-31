-- 0107-app-notification-recipients-run2-apply.sql
-- B1 (Sri, 31 Oct): admins invited from another org get the org's
-- notification emails
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. ONE transaction. Run AFTER run1-precheck.sql and BEFORE the
-- push. Harmless to the code that's live now, which doesn't call it.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Same SQL as db/migrations/0107_app_notification_recipients.sql (see
-- its header for what each part is for), plus a self-check before
-- COMMIT: the function is SECURITY DEFINER with search_path pinned,
-- owned by visibleau_notification_reader, executable by visibleau_app
-- and not by PUBLIC, and its owner kept no CREATE on the schema.
-- Re-running it is safe.
--
-- Expected result: "Statement executed successfully" on the first tab
-- (one NOTICE about the policy not existing is fine on the first run),
-- then one row:
--   security_definer = t
--   owner = visibleau_notification_reader
--   search_path = {"search_path=pg_catalog, pg_temp"}
--   app_role_can_execute = t, public_can_execute = f
--   rows_with_no_org_context = 0
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_notification_reader') THEN
    CREATE ROLE visibleau_notification_reader
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

GRANT visibleau_notification_reader TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO visibleau_notification_reader;
GRANT SELECT (id, deleted_at) ON public.organizations TO visibleau_notification_reader;
GRANT SELECT (organization_id, user_id, role, is_active, accepted_at)
  ON public.org_members TO visibleau_notification_reader;
GRANT SELECT (id, email) ON public.users TO visibleau_notification_reader;

DROP POLICY IF EXISTS users_notification_recipients_select ON public.users;
CREATE POLICY users_notification_recipients_select ON public.users
  FOR SELECT
  TO visibleau_notification_reader
  USING (EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.user_id = users.id
      AND m.organization_id = current_setting('app.current_org_id', true)::uuid
      AND m.role IN ('owner', 'admin')
      AND m.is_active
      AND m.accepted_at IS NOT NULL
  ));

CREATE OR REPLACE FUNCTION public.app_notification_recipients()
RETURNS TABLE (user_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  ctx text := current_setting('app.current_org_id', true);
BEGIN
  -- Unset (NULL), reset to '' after an earlier transaction, or not a
  -- uuid: no org, so no rows -- and no table is read.
  IF ctx IS NULL
     OR ctx !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT u.id, u.email
    FROM public.org_members m
    JOIN public.organizations o ON o.id = m.organization_id
    JOIN public.users u ON u.id = m.user_id
    WHERE m.organization_id = ctx::uuid
      AND o.deleted_at IS NULL
      AND m.role IN ('owner', 'admin')
      AND m.is_active
      AND m.accepted_at IS NOT NULL
      AND position('@' IN u.email) > 0
      AND lower(btrim(u.email)) <> 'pending@sync.local';
END
$fn$;

GRANT CREATE ON SCHEMA public TO visibleau_notification_reader;
ALTER FUNCTION public.app_notification_recipients() OWNER TO visibleau_notification_reader;
REVOKE CREATE ON SCHEMA public FROM visibleau_notification_reader;

REVOKE ALL ON FUNCTION public.app_notification_recipients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_notification_recipients() TO visibleau_app;

DO $$
DECLARE
  f record;
BEGIN
  SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig, p.proacl::text[] AS acl
  INTO f
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'app_notification_recipients';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0107 run2: app_notification_recipients() was not created';
  END IF;
  IF NOT f.prosecdef
     OR f.owner <> 'visibleau_notification_reader'
     OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp'] THEN
    RAISE EXCEPTION '0107 run2: wrong shape (security definer %, owner %, config %)',
      f.prosecdef, f.owner, f.proconfig;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(f.acl) AS a(entry) WHERE a.entry LIKE '=%') THEN
    RAISE EXCEPTION '0107 run2: PUBLIC can still execute it';
  END IF;
  IF NOT has_function_privilege('visibleau_app', 'public.app_notification_recipients()', 'EXECUTE') THEN
    RAISE EXCEPTION '0107 run2: visibleau_app cannot execute it';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_namespace n, aclexplode(n.nspacl) a
    WHERE n.nspname = 'public'
      AND a.grantee = 'visibleau_notification_reader'::regrole
      AND a.privilege_type = 'CREATE'
  ) THEN
    RAISE EXCEPTION '0107 run2: the owner kept CREATE on schema public';
  END IF;
END $$;

COMMIT;

SELECT
  p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner,
  p.proconfig AS search_path,
  has_function_privilege('visibleau_app', p.oid, 'EXECUTE') AS app_role_can_execute,
  EXISTS (SELECT 1 FROM unnest(p.proacl::text[]) AS a(entry) WHERE a.entry LIKE '=%') AS public_can_execute,
  (SELECT count(*) FROM public.app_notification_recipients()) AS rows_with_no_org_context
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'app_notification_recipients';
