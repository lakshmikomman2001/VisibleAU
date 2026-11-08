-- diag-0138-signin-accounts-without-profile.sql (live invite test follow-ups, part 2, 8 Nov) -- sign-in
-- accounts (better-auth auth_users) with no profile (users), the kind diag-0137 found for s***@gmail.com.
--
-- How they come about: sign-up makes the sign-in account at once (app/sign-up/[[...sign-up]]/
-- sign-up-form.tsx, better-auth's signUp.email), but no session until the address is verified
-- (lib/auth/server.ts requireEmailVerification), and the profile and workspace only when the verified
-- account creates its workspace at /no-workspace (lib/auth/workspace.ts createWorkspace ->
-- provisionAppWorkspace). A sign-up that never verifies, or never creates its workspace, keeps its account
-- and has no profile. Before this push, an invite to such an address was sent as if it had no account, and
-- its sign-up then refused it ("An account already uses this address").
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, in a READ ONLY transaction that ends in ROLLBACK. Counts and months only -- no
-- addresses, names or ids. Sri runs it; NOT run from Claude Code.
--
-- Expected: query 1 lists months with a count (at least 1, the account diag-0137 found); query 2 the totals.
-- with_pending_invite counts pending, unexpired invites to the address in an open workspace -- each of
-- those, once this push is live, gets the sign-in route and joins through claimInviteForAccount.

BEGIN TRANSACTION READ ONLY;

-- 1. By month the account was made (Sydney): accounts with no profile, how many verified their address,
--    and how many have a pending invite to it.
WITH bare AS (
  SELECT a.id, a.email, a.email_verified, a.created_at
  FROM auth_users a
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.clerk_user_id = a.id)
)
SELECT
  to_char(date_trunc('month', b.created_at AT TIME ZONE 'Australia/Sydney'), 'YYYY-MM') AS month_created,
  count(*) AS accounts_without_profile,
  count(*) FILTER (WHERE b.email_verified) AS verified,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1
    FROM org_members m
    JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
    WHERE m.user_id IS NULL
      AND m.accepted_at IS NULL
      AND m.expires_at > now()
      AND lower(m.invited_email) = lower(b.email)
  )) AS with_pending_invite
FROM bare b
GROUP BY 1
ORDER BY 1;

-- 2. Totals, and how many of them belong to a better-auth organisation (made one, and never got the app
--    workspace that goes with it).
WITH bare AS (
  SELECT a.id, a.email, a.email_verified
  FROM auth_users a
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.clerk_user_id = a.id)
)
SELECT
  count(*) AS accounts_without_profile,
  count(*) FILTER (WHERE b.email_verified) AS verified,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM auth_members am WHERE am.user_id = b.id))
    AS in_an_auth_organisation,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1
    FROM org_members m
    JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
    WHERE m.user_id IS NULL
      AND m.accepted_at IS NULL
      AND m.expires_at > now()
      AND lower(m.invited_email) = lower(b.email)
  )) AS with_pending_invite
FROM bare b;

ROLLBACK;
