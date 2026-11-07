-- 0131-invites-for-new-accounts-run3-post-check.sql (Vunnara, 8 Nov, team
-- follow-ups item 4)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: query 1 one row -- user_id_nullable =
-- YES, check and index present and valid, app_role_* = t (the invite and
-- sign-up routes write org_members through prod-fix 0052's table grants), and
-- invites_without_profile = 0.
-- Run again after the push and an invite to a new address: query 2 shows
-- each workspace's invites still waiting for an account, pending and expired
-- (counts only, no addresses). One that's accepted leaves this list: its
-- user_id is set.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'user_id') AS user_id_nullable,
  (SELECT convalidated FROM pg_constraint
   WHERE conname = 'org_members_profile_or_pending_invite') AS check_validated,
  (SELECT indisvalid FROM pg_index
   WHERE indexrelid = to_regclass('public.org_members_pending_address_idx')) AS index_valid,
  has_table_privilege('visibleau_app', 'org_members', 'INSERT') AS app_role_insert,
  has_table_privilege('visibleau_app', 'org_members', 'UPDATE') AS app_role_update,
  has_table_privilege('visibleau_app', 'org_members', 'DELETE') AS app_role_delete,
  (SELECT count(*) FROM org_members WHERE user_id IS NULL) AS invites_without_profile;

SELECT
  m.organization_id,
  count(*) FILTER (WHERE m.expires_at > now()) AS waiting,
  count(*) FILTER (WHERE m.expires_at <= now()) AS expired,
  max(m.invited_at) AT TIME ZONE 'Australia/Sydney' AS last_sent_sydney
FROM org_members m
WHERE m.user_id IS NULL
GROUP BY 1
ORDER BY 1;
