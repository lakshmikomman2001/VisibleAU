-- 0131-invites-for-new-accounts-run2-apply.sql (Vunnara, 8 Nov, team
-- follow-ups item 4)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Run
-- AFTER run1-precheck.sql, and BEFORE the push. DROP NOT NULL is
-- metadata-only; the check reads org_members once (a few rows); the unique
-- index is built on a small table, inside the transaction (no CONCURRENTLY).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then one row with
-- user_id_nullable = YES, check_present = t, check_validated = t,
-- index_present = t, index_valid = t.
BEGIN;

ALTER TABLE org_members ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE org_members ADD CONSTRAINT org_members_profile_or_pending_invite CHECK (
    user_id IS NOT NULL
    OR (invited_email IS NOT NULL AND invitation_token IS NOT NULL AND accepted_at IS NULL AND NOT is_active)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS org_members_pending_address_idx
  ON org_members (organization_id, lower(invited_email))
  WHERE user_id IS NULL;

COMMIT;

SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'user_id') AS user_id_nullable,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_members_profile_or_pending_invite'
  ) AS check_present,
  (SELECT convalidated FROM pg_constraint
   WHERE conname = 'org_members_profile_or_pending_invite') AS check_validated,
  to_regclass('public.org_members_pending_address_idx') IS NOT NULL AS index_present,
  (SELECT indisvalid FROM pg_index
   WHERE indexrelid = to_regclass('public.org_members_pending_address_idx')) AS index_valid;
