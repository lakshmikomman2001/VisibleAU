-- 0130-invited-email-run4-rollback.sql (Vunnara, 7 Nov, team follow-ups
-- item 1)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that writes the column has been rolled back -- the
-- invite route inserts and updates org_members.invited_email, so dropping it
-- while that code is live fails every invite with 42703.
--
-- Dropping the column loses the address recorded for every invite since
-- run2; the Team page's pending invites then show only a role again for
-- anyone whose profile is in another workspace. Nothing else reads it.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- invited_email_present = f.
BEGIN;

ALTER TABLE org_members DROP COLUMN IF EXISTS invited_email;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_members' AND column_name = 'invited_email'
  ) AS invited_email_present;
