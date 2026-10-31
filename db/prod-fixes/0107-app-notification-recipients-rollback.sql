-- 0107-app-notification-recipients-rollback.sql
-- B1 (Sri, 31 Oct): admins invited from another org get the org's
-- notification emails
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. ONE transaction. ONLY if run2 needs undoing.
-- Sri-authorized only. NOT run from Claude Code.
--
-- REVERT THE B1 CODE COMMIT FIRST (or never push it). Once it's live,
-- every notification email calls app_notification_recipients(), so
-- dropping the function stops audit-complete, schedule-failure,
-- hallucination and drift emails until the code is reverted.
--
-- Drops the function and the users policy, revokes everything granted to
-- visibleau_notification_reader in this database, and drops the role.
-- No data is touched.
--
-- Expected result: "Statement executed successfully" on the first tab,
-- then one row: function_left = 0, policy_left = 0, role_left = 0.
BEGIN;

DROP FUNCTION IF EXISTS public.app_notification_recipients();
DROP POLICY IF EXISTS users_notification_recipients_select ON public.users;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_notification_reader') THEN
    -- Revokes its column and schema privileges in this database.
    DROP OWNED BY visibleau_notification_reader;
    DROP ROLE visibleau_notification_reader;
  END IF;
END $$;

COMMIT;

SELECT
  (SELECT count(*) FROM pg_proc WHERE proname = 'app_notification_recipients') AS function_left,
  (SELECT count(*) FROM pg_policy WHERE polname = 'users_notification_recipients_select') AS policy_left,
  (SELECT count(*) FROM pg_roles WHERE rolname = 'visibleau_notification_reader') AS role_left;
