-- 0130-invited-email-run2b-backfill-pending.sql (Vunnara, 7 Nov, team
-- follow-ups item 1) -- OPTIONAL, Sri's call.
--
-- PRODUCTION branch (Neon). Only after run2-apply.sql. Run on its own, as one
-- editor submission. Sri-authorized only. NOT run from Claude Code.
--
-- What it changes: invites still pending (accepted_at IS NULL) that were sent
-- before the column existed have no invited_email, so the Team page shows
-- "Address not recorded" for them. This fills it from the invited profile, as
-- the invite route matched it when the invite was sent: the profile's own
-- address, or -- for a profile still holding the sign-up placeholder
-- (pending@sync.local) -- its account's address. That's the address the
-- invite was emailed to, unless the profile's address has changed since.
-- Accepted memberships are left as they are.
-- Skip it to let those invites read "Address not recorded" until each is
-- re-sent (Resend is then disabled; Cancel and invite again) or expires.
--
-- Rollback: run4-rollback.sql drops the column, with every value in it.
--
-- Expected result: "UPDATE n" with n at most run1's pending_invites, then one
-- row: pending invites with and without an address (counts only).
BEGIN;

UPDATE org_members m
SET invited_email = CASE WHEN u.email = 'pending@sync.local' THEN au.email ELSE u.email END
FROM users u
LEFT JOIN auth_users au ON au.id = u.clerk_user_id
WHERE u.id = m.user_id
  AND m.accepted_at IS NULL
  AND m.invited_email IS NULL
  AND (u.email <> 'pending@sync.local' OR au.email IS NOT NULL);

COMMIT;

SELECT
  count(*) FILTER (WHERE invited_email IS NOT NULL) AS pending_with_address,
  count(*) FILTER (WHERE invited_email IS NULL) AS pending_without_address
FROM org_members
WHERE accepted_at IS NULL;
