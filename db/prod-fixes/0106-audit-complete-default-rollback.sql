-- 0106-audit-complete-default-rollback.sql
-- A1 (Sri, 31 Oct): the audit-complete email is on by default
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. ONE transaction. ONLY if run2 needs undoing. Doesn't need
-- the backup table, so it can run before or after run4.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Puts the column's default back to false. That alone doesn't undo A1:
-- the app treats an org with no saved preferences as on whatever this
-- default is (lib/email/recipients.ts). To switch the default back off,
-- revert the A1 code commit as well. No saved row is touched.
--
-- Expected result: "Statement executed successfully" on the first tab,
-- then one row: current_default = false. Afterwards run3's check 1 reads
-- FAIL, as expected.
BEGIN;

ALTER TABLE notification_preferences
  ALTER COLUMN email_on_audit_complete SET DEFAULT false;

COMMIT;

SELECT pg_get_expr(ad.adbin, ad.adrelid) AS current_default
FROM pg_attribute a
JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE a.attrelid = 'public.notification_preferences'::regclass
  AND a.attname = 'email_on_audit_complete';
