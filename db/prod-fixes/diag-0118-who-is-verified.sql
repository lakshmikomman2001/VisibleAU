-- diag-0118-who-is-verified.sql
-- "Require a verified email, gently" (Sri, 3 Nov)
--
-- PRODUCTION branch (Neon). READ-ONLY: a SELECT only. Paste into the Neon SQL
-- editor. NOT run from Claude Code -- there is no prod access from that
-- environment. Sri-authorized only.
--
-- Run BEFORE and after you verify your own accounts, and again before the push.
-- From that push on an unverified account can't sign in until it opens the emailed
-- link; a session it already holds keeps working until it ends.
--
-- Prints each address masked (first letter and domain), so you can tell your own
-- apart. No full addresses, names or tokens.
--
-- Expected:
-- email_verified = t on your own accounts before you push. diag-0117 query 4 said
--   1 of the 6 is verified: this says which.
-- live_sessions: how many accounts keep working without verifying, for now.
-- password_sign_in = f would be an account that can't sign in with a password at all.

SELECT
  left(a.email, 1) || '***@' || split_part(a.email, '@', 2) AS address,
  a.email_verified,
  a.created_at::date AS account_created,
  EXISTS (
    SELECT 1 FROM auth_accounts c
    WHERE c.user_id = a.id AND c.provider_id = 'credential' AND c.password IS NOT NULL
  ) AS password_sign_in,
  (SELECT count(*) FROM auth_sessions s
    WHERE s.user_id = a.id AND s.expires_at > now()) AS live_sessions,
  (SELECT max(s.expires_at)::date FROM auth_sessions s WHERE s.user_id = a.id) AS last_session_ends,
  u.role AS profile_role,
  u.organization_id,
  o.deleted_at IS NOT NULL AS workspace_closed
FROM auth_users a
LEFT JOIN users u ON u.clerk_user_id = a.id
LEFT JOIN organizations o ON o.id = u.organization_id
ORDER BY a.created_at;
