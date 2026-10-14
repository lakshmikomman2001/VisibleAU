-- 0053-org-members-invite-expiry-precheck-prod.sql (task #46, 15th follow-up)
--
-- Read-only. Run on the PRODUCTION branch (Neon SQL editor) BEFORE
-- 0053-...-apply-prod.sql -- confirms the column is really missing and
-- shows how many pending (unaccepted) invites exist today, which the
-- apply file's backfill will give a computed expiry to.
SELECT
  (NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'org_members' AND column_name = 'expires_at')) AS column_missing_as_expected,
  (SELECT count(*) FROM org_members) AS total_rows,
  (SELECT count(*) FROM org_members WHERE accepted_at IS NULL) AS pending_invite_rows;
