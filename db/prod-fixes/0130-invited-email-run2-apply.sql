-- 0130-invited-email-run2-apply.sql (Vunnara, 7 Nov, team follow-ups item 1)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Run
-- AFTER run1-precheck.sql, and BEFORE the push. ADD COLUMN with no default is
-- metadata-only (no row rewrite).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then one row with
-- invited_email_present = t.
BEGIN;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS invited_email text;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_members' AND column_name = 'invited_email'
  ) AS invited_email_present;
