-- diag-0103-workspace-create-state.sql
-- "Create workspace" answered 404 "Org not found" (30 Oct, 21:45)
--
-- PRODUCTION branch. READ-ONLY: one SELECT statement. Paste into the Neon
-- SQL editor. NOT run from Claude Code -- there is no prod access from
-- that environment. Sri-authorized only.
--
-- HOW TO USE: put the account's email address between the quotes on the
-- line marked "EDIT THIS" (it's the only literal in the query) and run it
-- -- e.g. for l***@gmail.com. Safe to run before or after the push.
--
-- SHOWS (one row per fact, in order; no tokens, password hashes or email
-- addresses are selected):
--   1 account            -- does a better-auth account exist
--   2 better-auth orgs   -- every organisation the account is a member of,
--                           oldest first: name, slug, role, created
--                           (Sydney), and whether its app workspace
--                           (organizations.clerk_org_id) exists
--   3 82f66b9's pick     -- the org 82f66b9's /api/auth/sync-user would
--                           have used: the same query (first membership,
--                           no ORDER BY), so very likely the same row.
--                           "app workspace MISSING" there = the 404.
--   4 app profile        -- the `users` row the app reads on every page
--                           (lib/auth/current-user.ts), its workspace, and
--                           whether its stored email is the sign-up
--                           placeholder instead of the real address
--   5 verdict            -- what the account sees now, and after the push
--   6 placeholder emails -- all of production: how many profile rows
--                           still hold the placeholder (the optional
--                           0103-placeholder-profile-email-* fix)
--
-- EXPECTED for l***@gmail.com, from the reproduction on the e2e database:
--   section 2: an older org with app workspace MISSING (the earlier
--   half-finished attempt) and "vun" with app workspace exists; section
--   3: the older one; section 4: found by account id, workspace "vun",
--   stored email is the placeholder. That account then already signs in
--   to "vun" today -- only its email on the profile is wrong.

WITH target AS (
  SELECT lower(trim('PASTE-THE-EMAIL-ADDRESS-HERE')) AS email  -- EDIT THIS
),
acct AS (
  SELECT u.id
  FROM auth_users u
  JOIN target t ON lower(u.email) = t.email
),
auth_orgs AS (
  SELECT
    ao.name,
    ao.slug,
    am.role,
    am.created_at AS joined_at,
    o.id IS NOT NULL AS app_exists,
    o.deleted_at IS NOT NULL AS app_closed
  FROM auth_members am
  JOIN auth_organizations ao ON ao.id = am.organization_id
  LEFT JOIN organizations o ON o.clerk_org_id = ao.id
  WHERE am.user_id IN (SELECT id FROM acct)
),
old_pick AS (
  -- 82f66b9's sync-user: session.activeOrganizationId (never stored), then
  -- this -- the account's first membership, in no particular order.
  SELECT organization_id
  FROM auth_members
  WHERE user_id IN (SELECT id FROM acct)
  LIMIT 1
),
profile AS (
  SELECT
    CASE WHEN p.clerk_user_id IN (SELECT id FROM acct) THEN 'by account id' ELSE 'by email' END AS matched,
    p.email = 'pending@sync.local' AS placeholder_email,
    o.id IS NOT NULL AS org_exists,
    o.name AS org_name,
    o.deleted_at IS NOT NULL AS org_closed
  FROM users p
  LEFT JOIN organizations o ON o.id = p.organization_id
  WHERE p.clerk_user_id IN (SELECT id FROM acct)
     OR lower(p.email) = (SELECT email FROM target)
)
SELECT section, detail
FROM (
  -- 1. account
  SELECT 1 AS ord, 0::bigint AS sub, '1 account' AS section,
    CASE WHEN EXISTS (SELECT 1 FROM acct) THEN 'exists'
         ELSE 'NO better-auth account with this address' END AS detail

  -- 2. every better-auth org the account is in, oldest first
  UNION ALL
  SELECT 2, row_number() OVER (ORDER BY joined_at), '2 better-auth orgs',
    '"' || name || '" · slug ' || coalesce(slug, '(none)') || ' · role ' || role
    || ' · created ' || to_char(joined_at AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD HH24:MI') || ' (Sydney)'
    || ' · app workspace ' || CASE WHEN NOT app_exists THEN 'MISSING'
                                   WHEN app_closed THEN 'closed'
                                   ELSE 'exists' END
  FROM auth_orgs
  UNION ALL
  SELECT 2, 0, '2 better-auth orgs', 'none'
  WHERE NOT EXISTS (SELECT 1 FROM auth_orgs)

  -- 3. the org 82f66b9's sync-user picked
  UNION ALL
  SELECT 3, 0, '3 82f66b9''s pick',
    coalesce(
      (SELECT '"' || ao.name || '" · app workspace '
              || CASE WHEN o.id IS NULL THEN 'MISSING: sync-user answered 404 "Org not found"'
                      ELSE 'exists: sync-user would have worked' END
       FROM old_pick op
       JOIN auth_organizations ao ON ao.id = op.organization_id
       LEFT JOIN organizations o ON o.clerk_org_id = ao.id),
      'none: sync-user answered 400 "No active org"')

  -- 4. the app profile getCurrentUser() reads
  UNION ALL
  SELECT 4, row_number() OVER (), '4 app profile',
    'found ' || matched
    || ' · workspace ' || CASE WHEN NOT org_exists THEN 'MISSING'
                               ELSE '"' || org_name || '"' || CASE WHEN org_closed THEN ' (closed)' ELSE '' END END
    || ' · stored email: ' || CASE WHEN placeholder_email THEN 'the sign-up PLACEHOLDER, not the address'
                                   ELSE 'the address' END
  FROM profile
  UNION ALL
  SELECT 4, 0, '4 app profile', 'none -- no users row for this account'
  WHERE NOT EXISTS (SELECT 1 FROM profile)

  -- 5. verdict
  UNION ALL
  SELECT 5, 0, '5 verdict',
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM acct)
        THEN 'no account: check the address'
      WHEN EXISTS (SELECT 1 FROM profile WHERE org_exists)
        THEN 'HAS A WORKSPACE ("' || (SELECT org_name FROM profile WHERE org_exists LIMIT 1)
             || '"): signs in to it now, before and after the push'
             || CASE WHEN EXISTS (SELECT 1 FROM profile WHERE org_exists AND placeholder_email)
                     THEN '. Its profile email is the placeholder, so it gets no emails: the optional 0103-placeholder-profile-email fix corrects it'
                     ELSE '' END
      WHEN EXISTS (SELECT 1 FROM auth_orgs WHERE role = 'owner' AND app_exists AND NOT app_closed)
        THEN 'no workspace yet. After the push /no-workspace offers "Open '
             || (SELECT name FROM auth_orgs WHERE role = 'owner' AND app_exists AND NOT app_closed ORDER BY joined_at DESC LIMIT 1)
             || '", which finishes it'
      WHEN EXISTS (SELECT 1 FROM auth_orgs WHERE role = 'owner' AND NOT app_exists)
        THEN 'half-finished. After the push /no-workspace offers "Open '
             || (SELECT name FROM auth_orgs WHERE role = 'owner' AND NOT app_exists ORDER BY joined_at DESC LIMIT 1)
             || '" (makes its app workspace) or "Create workspace"'
      ELSE 'no workspace and no org of its own: after the push /no-workspace offers "Create workspace"'
    END

  -- 6. placeholder emails, all of production (counts only)
  UNION ALL
  SELECT 6, 0, '6 placeholder emails',
    count(*) || ' profile row(s) still hold the sign-up placeholder; '
    || count(a.id) || ' of them have a matching account the fix can take the address from'
  FROM users p
  LEFT JOIN auth_users a ON a.id = p.clerk_user_id
  WHERE p.email = 'pending@sync.local'
) facts
ORDER BY ord, sub;
