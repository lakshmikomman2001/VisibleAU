-- diag-0117-unverified-accounts.sql
-- "The /launch page's hard-coded email gate" (Sri, 3 Nov)
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECT statements only. Paste into
-- the Neon SQL editor. NOT run from Claude Code -- there is no prod access
-- from that environment. Sri-authorized only.
--
-- Sign-up needs no verified address (lib/auth/server.ts, requireEmailVerification:
-- false), so an account can claim any address nobody has registered. Two things
-- follow, and this diag shows whether either has happened:
-- - /launch let in whoever held sri@visibleau.local. It showed only a static
--   checklist, and it's removed by this push.
-- - lib/auth/current-user.ts falls back to matching users.email when the account's
--   id matches no profile. So signing up with the address of a profile that has no
--   account opens that profile's workspace, in that profile's role. NOT changed by
--   this push: it's your decision, and query 2 says how urgent it is.
--
-- Prints ids, roles, dates, counts and yes/no flags only. The one address in here
-- is in a WHERE clause. No other names, addresses or tokens.
--
-- Expected:
-- query 1 -- accounts and profiles at sri@visibleau.local: both 0 on production,
--   unless the dev seed (scripts/seed-auth-user.ts, password123) was ever run there.
-- query 2 -- profiles anyone could take over today. MUST be empty. Any row: that
--   workspace opens for whoever signs up with that profile's address first.
-- query 3 -- accounts already using the fallback: their id matches no profile, the
--   address does. Empty means nobody needs the fallback and it can go. A row with
--   email_verified = f is either its real owner or someone who claimed it: look
--   at when the account was made against when the profile was.
-- query 4 -- how many accounts are verified at all: turning on
--   requireEmailVerification would stop every unverified one signing in.

-- 1. Whoever holds the address /launch trusted.
SELECT
  (SELECT count(*) FROM auth_users WHERE lower(email) = 'sri@visibleau.local') AS accounts,
  (SELECT count(*) FROM auth_users
    WHERE lower(email) = 'sri@visibleau.local' AND email_verified) AS verified_accounts,
  (SELECT count(*) FROM users WHERE lower(email) = 'sri@visibleau.local') AS profiles;

-- 2. Profiles with no account by id and none by address: the first to sign up with
-- that address becomes this profile. The sign-up placeholder is left out: it's
-- not an address anyone can register as this profile's.
SELECT
  u.id AS profile_id,
  u.organization_id,
  o.deleted_at IS NOT NULL AS workspace_closed,
  u.role,
  u.created_at AS profile_created_at
FROM users u
JOIN organizations o ON o.id = u.organization_id
WHERE u.email <> 'pending@sync.local'
  AND NOT EXISTS (SELECT 1 FROM auth_users a WHERE a.id = u.clerk_user_id)
  AND NOT EXISTS (SELECT 1 FROM auth_users a WHERE a.email = u.email)
ORDER BY u.created_at;

-- 3. Accounts relying on the fallback today.
SELECT
  u.id AS profile_id,
  u.organization_id,
  u.role,
  a.email_verified,
  u.created_at AS profile_created_at,
  a.created_at AS account_created_at
FROM auth_users a
JOIN users u ON u.email = a.email
WHERE NOT EXISTS (SELECT 1 FROM users byid WHERE byid.clerk_user_id = a.id)
ORDER BY a.created_at DESC;

-- 4. Verified and unverified accounts.
SELECT email_verified, count(*) AS accounts
FROM auth_users
GROUP BY email_verified
ORDER BY email_verified;
