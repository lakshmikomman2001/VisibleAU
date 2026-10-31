-- 0106-audit-complete-default-run1-backup.sql
-- A1 (Sri, 31 Oct): the audit-complete email is on by default
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. Run FIRST, then run2. Mirrors db/migrations/
-- 0106_notification_preferences_audit_complete_default.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Stops (an exception, nothing created) unless notification_preferences.
-- email_on_audit_complete exists, is NOT NULL and defaults to false (or
-- to true, if run2 has already run). Then snapshots every saved row's
-- switch -- organisation id, value and updated_at, no addresses -- so
-- run3 can show that run2 changed no saved row.
--
-- Its second tab answers A1's question about existing rows. Every row
-- was written by Save on Settings > Notifications (PATCH /api/
-- notification-preferences -- the table's only writer since it was
-- added on 25 Jun), and Save sends every switch as the page shows it.
-- So a stored false means "someone pressed Save while the switch showed
-- off": the old default, or a deliberate choice. Nothing records which:
-- no updated_by column, no audit-trail entry, and updated_at only says
-- the row was saved again, not which switch changed. So no row is
-- flipped; Sri decides.
--
-- Expected result: tab 1 "Statement executed successfully"; tab 2 one
-- row -- current_default false, the counts as they really are, and
-- snapshot_rows = orgs_with_saved_preferences.
BEGIN;

DO $$
DECLARE
  col_default text;
  col_not_null boolean;
BEGIN
  SELECT pg_get_expr(ad.adbin, ad.adrelid), a.attnotnull
  INTO col_default, col_not_null
  FROM pg_attribute a
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE a.attrelid = 'public.notification_preferences'::regclass
    AND a.attname = 'email_on_audit_complete'
    AND NOT a.attisdropped;
  IF NOT FOUND THEN
    RAISE EXCEPTION '0106 run1: notification_preferences.email_on_audit_complete does not exist';
  END IF;
  IF NOT col_not_null THEN
    RAISE EXCEPTION '0106 run1: email_on_audit_complete allows NULL; expected NOT NULL';
  END IF;
  IF col_default IS DISTINCT FROM 'false' AND col_default IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '0106 run1: email_on_audit_complete defaults to %, expected false (or true after run2)',
      coalesce(col_default, 'nothing');
  END IF;
END $$;

CREATE TABLE _backup_0106_audit_complete AS
SELECT organization_id, email_on_audit_complete, updated_at
FROM notification_preferences;

COMMIT;

SELECT
  (SELECT pg_get_expr(ad.adbin, ad.adrelid)
   FROM pg_attribute a
   JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
   WHERE a.attrelid = 'public.notification_preferences'::regclass
     AND a.attname = 'email_on_audit_complete') AS current_default,
  (SELECT count(*) FROM organizations WHERE deleted_at IS NULL) AS open_orgs,
  (SELECT count(*) FROM organizations o
   WHERE o.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM notification_preferences p WHERE p.organization_id = o.id))
    AS open_orgs_never_saved_now_on,
  (SELECT count(*) FROM notification_preferences) AS orgs_with_saved_preferences,
  (SELECT count(*) FROM notification_preferences WHERE email_on_audit_complete) AS saved_on,
  (SELECT count(*) FROM notification_preferences WHERE NOT email_on_audit_complete) AS saved_off,
  (SELECT count(*) FROM notification_preferences p JOIN organizations o ON o.id = p.organization_id
   WHERE NOT p.email_on_audit_complete AND o.deleted_at IS NULL) AS saved_off_open_orgs,
  (SELECT count(*) FROM notification_preferences
   WHERE NOT email_on_audit_complete AND updated_at = created_at) AS saved_off_saved_once,
  (SELECT count(*) FROM notification_preferences
   WHERE NOT email_on_audit_complete AND updated_at <> created_at) AS saved_off_saved_more_than_once,
  (SELECT count(*) FROM _backup_0106_audit_complete) AS snapshot_rows;
