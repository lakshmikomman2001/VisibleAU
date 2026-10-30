-- diag-0102-account-state.sql
-- "Signing in reaches the dashboard, then the user is signed out" (27 Oct)
--
-- PRODUCTION branch. READ-ONLY: one SELECT statement. Paste into the Neon
-- SQL editor. NOT run from Claude Code -- there is no prod access from
-- that environment. Sri-authorized only.
--
-- HOW TO USE: put the account's email address between the quotes on the
-- line marked "EDIT THIS" (it's the only literal in the query), run it,
-- then change it to the next address and run again -- e.g. once for
-- l***@gmail.com and once for s***@vunnara.com.au (the account that stays
-- signed in, for comparison).
--
-- SHOWS (one row per fact, in order; no tokens, password hashes or email
-- addresses are selected):
--   1 account          -- does a better-auth account exist; email verified;
--                         created / updated (Sydney time)
--   2 sign-in methods  -- auth accounts by provider type only (credential = password)
--   3 sessions         -- how many in the last 24 hours, and each one's
--                         created / expires and whether it's still valid
--   4 app profile      -- the `users` row the app reads on every page
--                         (lib/auth/current-user.ts): found by account id or
--                         by email, its workspace, and whether that exists
--   5 verdict          -- what the app does with this account
--   6 team memberships -- org_members rows: org, role, accepted / invited
--   7 auth memberships -- better-auth org memberships, and whether each one's
--                         app workspace was ever created
--   8 active org       -- not stored (see the row)
--
-- READING THE VERDICT:
--   "NO WORKSPACE" = the account signs in, but no profile row places it in a
--   workspace, so every signed-in page used to send it back to /sign-in --
--   it looked signed out though the session was valid. With this fix it
--   lands on /no-workspace, which offers "Open <org>" (when section 7 shows
--   a membership whose app workspace exists) or "Create workspace".

WITH target AS (
  SELECT lower(trim('PASTE-THE-EMAIL-ADDRESS-HERE')) AS email  -- EDIT THIS
),
acct AS (
  SELECT u.id, u.email_verified, u.created_at, u.updated_at
  FROM auth_users u
  JOIN target t ON lower(u.email) = t.email
),
profile AS (
  SELECT
    p.id,
    p.role,
    CASE WHEN p.clerk_user_id IN (SELECT id FROM acct) THEN 'by account id' ELSE 'by email' END AS matched,
    (p.email = 'pending@sync.local') AS placeholder_email,
    o.id IS NOT NULL AS org_exists,
    o.name AS org_name,
    o.deleted_at AS org_deleted_at
  FROM users p
  LEFT JOIN organizations o ON o.id = p.organization_id
  WHERE p.clerk_user_id IN (SELECT id FROM acct)
     OR lower(p.email) = (SELECT email FROM target)
),
recent_sessions AS (
  SELECT s.created_at, s.expires_at
  FROM auth_sessions s
  WHERE s.user_id IN (SELECT id FROM acct)
    AND s.created_at > now() - interval '24 hours'
)
SELECT section, detail
FROM (
  -- 1. account
  SELECT 1 AS ord, 0::bigint AS sub, '1 account' AS section,
    CASE WHEN EXISTS (SELECT 1 FROM acct) THEN 'exists'
         ELSE 'NO better-auth account with this address' END AS detail
  UNION ALL
  SELECT 1, 1, '1 account',
    'email verified: ' || email_verified
    || ' · created ' || to_char(created_at AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD HH24:MI')
    || ' · updated ' || to_char(updated_at AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD HH24:MI')
    || ' (Sydney)'
  FROM acct

  -- 2. sign-in methods, by provider type only
  UNION ALL
  SELECT 2, 0, '2 sign-in methods', provider_id || ' x ' || count(*)
  FROM auth_accounts
  WHERE user_id IN (SELECT id FROM acct)
  GROUP BY provider_id
  UNION ALL
  SELECT 2, 0, '2 sign-in methods', 'none'
  WHERE NOT EXISTS (SELECT 1 FROM auth_accounts WHERE user_id IN (SELECT id FROM acct))

  -- 3. sessions in the last 24 hours (no token values)
  UNION ALL
  SELECT 3, 0, '3 sessions (last 24h)', count(*) || ' created' FROM recent_sessions
  UNION ALL
  SELECT 3, row_number() OVER (ORDER BY created_at), '3 sessions (last 24h)',
    'created ' || to_char(created_at AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD HH24:MI')
    || ' · expires ' || to_char(expires_at AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD HH24:MI')
    || ' (Sydney) · still valid: ' || CASE WHEN expires_at > now() THEN 'yes' ELSE 'no' END
  FROM recent_sessions

  -- 4. the app profile getCurrentUser() reads
  UNION ALL
  SELECT 4, row_number() OVER (), '4 app profile',
    'found ' || matched || ' · role ' || role
    || ' · workspace ' || CASE WHEN NOT org_exists THEN 'MISSING'
                               ELSE '"' || org_name || '"' || CASE WHEN org_deleted_at IS NOT NULL THEN ' (deleted)' ELSE '' END END
    || CASE WHEN placeholder_email THEN ' · stored email is still the sign-up placeholder' ELSE '' END
  FROM profile
  UNION ALL
  SELECT 4, 0, '4 app profile', 'none -- no users row for this account'
  WHERE NOT EXISTS (SELECT 1 FROM profile)

  -- 5. verdict (getCurrentUser: by account id first, then by email)
  UNION ALL
  SELECT 5, 0, '5 verdict',
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM acct)
        THEN 'no account: sign-in says "Invalid email or password"'
      WHEN EXISTS (SELECT 1 FROM profile WHERE matched = 'by account id' AND org_exists)
        THEN 'has a workspace (profile found by account id): signs in and stays signed in'
      WHEN EXISTS (SELECT 1 FROM profile WHERE org_exists)
        THEN 'has a workspace (profile found by email): signs in and stays signed in'
      ELSE 'NO WORKSPACE: signs in, then every page sent it back to /sign-in (now: /no-workspace)'
    END

  -- 6. team memberships (org_members)
  UNION ALL
  SELECT 6, row_number() OVER (), '6 team memberships',
    coalesce(o.name, '(org missing)') || ' · role ' || m.role || ' · '
    || CASE WHEN m.accepted_at IS NOT NULL THEN 'accepted'
            WHEN m.expires_at < now() THEN 'invited, invite expired'
            ELSE 'invited, not accepted yet' END
    || ' · active ' || CASE WHEN m.is_active THEN 'yes' ELSE 'no' END
    || ' · org ' || CASE WHEN o.id IS NULL THEN 'missing'
                         WHEN o.deleted_at IS NOT NULL THEN 'deleted'
                         ELSE 'exists' END
  FROM org_members m
  LEFT JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id IN (SELECT id FROM profile)
  UNION ALL
  SELECT 6, 0, '6 team memberships', 'none'
  WHERE NOT EXISTS (SELECT 1 FROM org_members WHERE user_id IN (SELECT id FROM profile))

  -- 7. better-auth memberships, and whether each app workspace exists
  UNION ALL
  SELECT 7, row_number() OVER (), '7 auth memberships',
    ao.name || ' · role ' || am.role || ' · app workspace '
    || CASE WHEN o.id IS NULL THEN 'MISSING (sign-up stopped before it was made)'
            WHEN o.deleted_at IS NOT NULL THEN 'deleted'
            ELSE 'exists' END
  FROM auth_members am
  JOIN auth_organizations ao ON ao.id = am.organization_id
  LEFT JOIN organizations o ON o.clerk_org_id = ao.id
  WHERE am.user_id IN (SELECT id FROM acct)
  UNION ALL
  SELECT 7, 0, '7 auth memberships', 'none'
  WHERE NOT EXISTS (SELECT 1 FROM auth_members WHERE user_id IN (SELECT id FROM acct))

  -- 8. active org
  UNION ALL
  SELECT 8, 0, '8 active org',
    'not stored: auth_sessions has no active_organization_id column; the app uses the profile row (4)'
) facts
ORDER BY ord, sub;
