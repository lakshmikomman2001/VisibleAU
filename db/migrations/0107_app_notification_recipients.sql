-- Migration 0107 (Vunnara, 31 Oct, B1): admins invited from another org
-- get the org's notification emails.
--
-- An invited admin's users row stays in their home org, so under the
-- inviting org's RLS context the app role can't see it, and
-- lib/email/recipients.ts only ever found owners and admins whose own
-- account is in the org. Sri's decision: they do get notifications,
-- through one narrow, reviewed accessor -- nothing else changes for the
-- app role.
--
-- app_notification_recipients() returns (user_id, email) of the
-- accepted, active owner and admin members of the org in
-- app.current_org_id. Nothing when that is unset, empty or not a uuid,
-- or the org is closed; never the sign-up placeholder address.
--   - SECURITY DEFINER, search_path pinned, every table schema-qualified.
--   - Owned by visibleau_notification_reader: NOLOGIN, no attributes, and
--     able to read only the nine columns below. RLS applies to it like
--     any role; its one extra policy lets it see a users row only when
--     that user is an accepted, active owner/admin member of the context
--     org.
--   - EXECUTE: visibleau_app only (revoked from PUBLIC). Its one caller
--     is lib/email/recipients.ts (tests/unit/email/
--     notification-recipients-function-callers.test.ts).
--
-- Idempotent. Undone by db/prod-fixes/0107-app-notification-recipients-
-- rollback.sql.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_notification_reader') THEN
    CREATE ROLE visibleau_notification_reader
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

-- The role running this must be a member to hand the function to it,
-- and later to replace or drop it.
GRANT visibleau_notification_reader TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO visibleau_notification_reader;
GRANT SELECT (id, deleted_at) ON public.organizations TO visibleau_notification_reader;
GRANT SELECT (organization_id, user_id, role, is_active, accepted_at)
  ON public.org_members TO visibleau_notification_reader;
GRANT SELECT (id, email) ON public.users TO visibleau_notification_reader;

-- The existing users policies only show rows whose organization_id is the
-- context org; an invited admin's row is in their home org.
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

-- The new owner must hold CREATE on the schema while ownership moves to
-- it; it doesn't keep it.
GRANT CREATE ON SCHEMA public TO visibleau_notification_reader;
ALTER FUNCTION public.app_notification_recipients() OWNER TO visibleau_notification_reader;
REVOKE CREATE ON SCHEMA public FROM visibleau_notification_reader;

REVOKE ALL ON FUNCTION public.app_notification_recipients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_notification_recipients() TO visibleau_app;

COMMIT;
