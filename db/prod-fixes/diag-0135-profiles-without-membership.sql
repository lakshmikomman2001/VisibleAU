-- diag-0135-profiles-without-membership.sql (follow-ups from 6e27afc..01a6a8c, part 1, 8 Nov) -- run BEFORE
-- the push: who the new access rule would lock out.
--
-- From this push, a workspace opens only for a profile with an active, accepted membership in it
-- (lib/auth/current-user.ts), and every role comes from that membership alone (lib/governance roleOf; it
-- fell back to the profile's own users.role). A removed member used to keep access while their profile
-- stayed in the workspace. Any profile in an open workspace WITHOUT an active, accepted membership there
-- -- removed, never given one, or never accepted -- loses that workspace at the push: it lands on
-- /no-workspace, and every API route answers as for an account with no workspace.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, in a READ ONLY transaction that ends in ROLLBACK. Workspace ids and counts
-- only -- no names, addresses, tokens or secrets. Sri runs it; NOT run from Claude Code.
--
-- Expected: query 1 returns no rows, and query 2 shows would_be_locked_out = 0 (diag-0132, 8 Nov: all 5
-- profiles' roles came from memberships). Push only if both say so. A row in query 1 is a workspace
-- where that many people would lose access: give each an accepted, active membership first, or confirm
-- they were meant to be removed. (The sample audit's workspace has no profiles, so it never appears.)
--
-- Query 3 (part 5) counts webhook endpoints. Until e0791fc the Settings -> Webhooks page and GET
-- /api/webhooks-config sent every endpoint's signing secret to every role in its workspace. If any
-- endpoint exists, Sri decides whether to rotate its secret (delete it and add it again). It doesn't
-- block the push. Counts only -- no secrets, no URLs.

BEGIN TRANSACTION READ ONLY;

-- 1. Per open workspace: its profiles with no active, accepted membership there, by why.
SELECT
  u.organization_id,
  count(*) AS would_be_locked_out,
  count(*) FILTER (WHERE m.id IS NULL) AS no_membership_row,
  count(*) FILTER (WHERE m.id IS NOT NULL AND m.accepted_at IS NOT NULL AND NOT m.is_active)
    AS removed,
  count(*) FILTER (WHERE m.id IS NOT NULL AND m.accepted_at IS NULL) AS invite_not_accepted,
  count(*) FILTER (WHERE u.role IN ('owner', 'admin')) AS profile_says_owner_or_admin
FROM users u
JOIN organizations o ON o.id = u.organization_id AND o.deleted_at IS NULL
LEFT JOIN org_members m ON m.organization_id = u.organization_id AND m.user_id = u.id
WHERE NOT coalesce(m.is_active AND m.accepted_at IS NOT NULL, false)
GROUP BY u.organization_id
ORDER BY u.organization_id;

-- 2. Totals: profiles in open workspaces, and how many of them would be locked out.
SELECT
  count(*) AS profiles_in_open_workspaces,
  count(*) FILTER (WHERE NOT coalesce(m.is_active AND m.accepted_at IS NOT NULL, false))
    AS would_be_locked_out
FROM users u
JOIN organizations o ON o.id = u.organization_id AND o.deleted_at IS NULL
LEFT JOIN org_members m ON m.organization_id = u.organization_id AND m.user_id = u.id;

-- 3. Webhook endpoints, whose signing secrets every role could read before e0791fc.
SELECT
  count(*) AS webhook_endpoints,
  count(*) FILTER (WHERE w.is_active) AS active,
  count(DISTINCT w.organization_id) AS workspaces,
  count(*) FILTER (WHERE o.deleted_at IS NULL) AS in_open_workspaces
FROM webhook_endpoints w
JOIN organizations o ON o.id = w.organization_id;

ROLLBACK;
