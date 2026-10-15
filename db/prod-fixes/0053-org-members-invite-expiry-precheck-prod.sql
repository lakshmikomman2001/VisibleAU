-- 0053-org-members-invite-expiry-precheck-prod.sql (task #46, 15th and 16th
-- follow-ups)
--
-- Read-only. Run on the PRODUCTION branch (Neon SQL editor) BEFORE
-- 0053-...-apply-prod.sql -- confirms the column is really missing and
-- shows how many pending (unaccepted) invites exist today, which the
-- apply file's backfill will give a computed expiry to (invited_at + 7
-- days, matching app/api/organizations/[orgId]/members/invite/route.ts's
-- own window). `already_expired_pending_rows` is the actionable number:
-- pending invites whose 7-day window from invited_at has already passed
-- as of right now -- these will immediately start returning the new
-- "This invitation has expired" 410 the moment 0053-apply runs, not some
-- time later. Share this count with whoever sent those invites before
-- applying, since real people may be about to click a link that now 410s.
SELECT
  (NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'org_members' AND column_name = 'expires_at')) AS column_missing_as_expected,
  (SELECT count(*) FROM org_members) AS total_rows,
  (SELECT count(*) FROM org_members WHERE accepted_at IS NULL) AS pending_invite_rows,
  (SELECT count(*) FROM org_members
   WHERE accepted_at IS NULL
     AND COALESCE(invited_at, updated_at, now()) + interval '7 days' < now()) AS already_expired_pending_rows;
