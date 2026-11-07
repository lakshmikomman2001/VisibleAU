-- diag-0132-effective-roles.sql (team follow-ups item 6, 8 Nov): the role every
-- server check will read for each account, before the push that makes them
-- check it.
--
-- From 27388a0 every route that changes a workspace's data reads the
-- signed-in profile's role (lib/governance/access-control.ts roleOf): its
-- active membership's role in its workspace (org_members), else the
-- profile's own users.role when that is a role (owner, admin, analyst,
-- viewer), else viewer -- read-only. Until now most routes read no role at
-- all, so an account whose profile says 'member' (the column's default) and
-- has no membership row could do everything; after the push it can change
-- nothing. This shows whether anyone is in that position, and whether each
-- open workspace still has someone who can manage billing (owner) and the
-- brands and team (owner or admin).
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECTs only, inside a READ ONLY
-- transaction that ends in ROLLBACK. Ids, roles and counts only -- no names
-- or addresses. Sri runs it; NOT run from Claude Code against production.
--
-- Expected: query 1 shows each effective role and where it comes from;
-- query 2 has no rows (no profile falls back to viewer for want of a role);
-- query 3 has no rows (every open workspace has an owner), except any with
-- profiles = 0 (no account in it at all: a half-finished sign-up's, or a
-- system workspace such as the sample audit's), which no check affects. Any
-- other row in 2 or 3 is an account to fix (an owner or admin membership)
-- BEFORE the push.

BEGIN TRANSACTION READ ONLY;

WITH profiles AS (
  SELECT
    u.id AS profile_id,
    u.organization_id,
    u.role AS profile_role,
    m.role AS membership_role,
    CASE
      WHEN m.role IN ('owner', 'admin', 'analyst', 'viewer') THEN m.role
      WHEN u.role IN ('owner', 'admin', 'analyst', 'viewer') THEN u.role
      ELSE 'viewer'
    END AS effective_role,
    CASE
      WHEN m.role IN ('owner', 'admin', 'analyst', 'viewer') THEN 'membership'
      WHEN u.role IN ('owner', 'admin', 'analyst', 'viewer') THEN 'profile'
      ELSE 'neither (viewer)'
    END AS role_from
  FROM users u
  JOIN organizations o ON o.id = u.organization_id AND o.deleted_at IS NULL
  LEFT JOIN org_members m
    ON m.organization_id = u.organization_id AND m.user_id = u.id AND m.is_active
)
-- 1. Profiles in open workspaces, by the role the checks will read.
SELECT effective_role, role_from, count(*) AS profiles
FROM profiles
GROUP BY 1, 2
ORDER BY 1, 2;

-- 2. Profiles that will read as viewer only because neither their membership
-- nor their profile names a role. Each one loses every change it could make.
WITH profiles AS (
  SELECT u.id AS profile_id, u.organization_id, u.role AS profile_role, m.role AS membership_role
  FROM users u
  JOIN organizations o ON o.id = u.organization_id AND o.deleted_at IS NULL
  LEFT JOIN org_members m
    ON m.organization_id = u.organization_id AND m.user_id = u.id AND m.is_active
)
SELECT profile_id, organization_id, profile_role, membership_role
FROM profiles
WHERE coalesce(membership_role, '') NOT IN ('owner', 'admin', 'analyst', 'viewer')
  AND profile_role NOT IN ('owner', 'admin', 'analyst', 'viewer')
ORDER BY organization_id, profile_id;

-- 3. Open workspaces with no owner as the checks read it (nobody could manage
-- billing or delete a brand), with their admins counted.
WITH effective AS (
  SELECT
    u.organization_id,
    CASE
      WHEN m.role IN ('owner', 'admin', 'analyst', 'viewer') THEN m.role
      WHEN u.role IN ('owner', 'admin', 'analyst', 'viewer') THEN u.role
      ELSE 'viewer'
    END AS role
  FROM users u
  LEFT JOIN org_members m
    ON m.organization_id = u.organization_id AND m.user_id = u.id AND m.is_active
)
SELECT
  o.id AS organization_id,
  count(e.role) FILTER (WHERE e.role = 'admin') AS admins,
  count(e.role) AS profiles
FROM organizations o
LEFT JOIN effective e ON e.organization_id = o.id
WHERE o.deleted_at IS NULL
GROUP BY o.id
HAVING count(e.role) FILTER (WHERE e.role = 'owner') = 0
ORDER BY o.id;

ROLLBACK;
