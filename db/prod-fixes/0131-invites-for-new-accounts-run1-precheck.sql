-- 0131-invites-for-new-accounts-run1-precheck.sql (Vunnara, 8 Nov, team
-- follow-ups item 4: inviting an address that has never signed up)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run AFTER 0130's run1-run3 (this
-- migration's check reads org_members.invited_email), BEFORE run2-apply.sql,
-- and BEFORE pushing the code -- inviting an address with no account inserts
-- org_members.user_id = NULL, which fails (23502, not-null violation) until
-- run2 has run.
-- Mirrors db/migrations/0131_invites_for_new_accounts.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: run2 drops a NOT NULL and adds a check and an index; no
-- value changes.
--
-- Expected result: one row -- user_id_nullable = NO, check_present = f,
-- index_present = f, invited_email_present = t (0130 has run), and
-- rows_without_profile = 0 (NOT NULL guarantees it). Counts only.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'user_id') AS user_id_nullable,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_members_profile_or_pending_invite'
  ) AS check_present,
  to_regclass('public.org_members_pending_address_idx') IS NOT NULL AS index_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_members' AND column_name = 'invited_email'
  ) AS invited_email_present,
  (SELECT count(*) FROM org_members WHERE user_id IS NULL) AS rows_without_profile,
  (SELECT count(*) FROM org_members) AS member_rows;
