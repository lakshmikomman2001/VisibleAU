-- 0106-audit-complete-default-run2-apply.sql
-- A1 (Sri, 31 Oct): the audit-complete email is on by default
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. ONE transaction. Run AFTER run1-backup.sql. Before or after
-- the push: the code never relies on this default (the only writer
-- always sends the column), but apply it with 0107, before the push, so
-- the database and the code agree from the start. Sri-authorized only.
-- NOT run from Claude Code.
--
-- Changes the column's default only -- a catalog change, no row is
-- rewritten or updated. Every saved preference keeps its value.
--
-- Expected result: "Statement executed successfully" on the first tab,
-- then one row: current_default = true.
BEGIN;

ALTER TABLE notification_preferences
  ALTER COLUMN email_on_audit_complete SET DEFAULT true;

DO $$
BEGIN
  IF (SELECT pg_get_expr(ad.adbin, ad.adrelid)
      FROM pg_attribute a
      JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE a.attrelid = 'public.notification_preferences'::regclass
        AND a.attname = 'email_on_audit_complete') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '0106 run2: email_on_audit_complete does not default to true; nothing committed';
  END IF;
END $$;

COMMIT;

SELECT pg_get_expr(ad.adbin, ad.adrelid) AS current_default
FROM pg_attribute a
JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE a.attrelid = 'public.notification_preferences'::regclass
  AND a.attname = 'email_on_audit_complete';
