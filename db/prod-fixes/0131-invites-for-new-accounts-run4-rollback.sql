-- 0131-invites-for-new-accounts-run4-rollback.sql (Vunnara, 8 Nov, team
-- follow-ups item 4)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that invites addresses with no account has been
-- rolled back -- it inserts org_members.user_id = NULL, which fails (23502)
-- once NOT NULL is back.
--
-- NOT NULL can't hold the invites still waiting for an account, so this
-- deletes them (run3's query 2 counts them first): their emailed links then
-- answer "Invalid or expired invitation", and each seat they held is free.
-- Accepted memberships all have a user_id and are untouched.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "DELETE n" (n = run3's invites_without_profile),
-- "Statement executed successfully", then user_id_nullable = NO,
-- check_present = f, index_present = f.
BEGIN;

DELETE FROM org_members WHERE user_id IS NULL;
DROP INDEX IF EXISTS org_members_pending_address_idx;
ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_profile_or_pending_invite;
ALTER TABLE org_members ALTER COLUMN user_id SET NOT NULL;

COMMIT;

SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'user_id') AS user_id_nullable,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_members_profile_or_pending_invite'
  ) AS check_present,
  to_regclass('public.org_members_pending_address_idx') IS NOT NULL AS index_present;
