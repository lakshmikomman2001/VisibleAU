-- diag-0133-memberless-workspaces.sql (follow-ups from d247ba7..f13411d, part 6, 8 Nov): every workspace
-- nobody can manage, and whether anything in it still runs or costs money.
--
-- diag-0132 (Sri ran it on 8 Nov) found one open workspace with 0 owners, 0 admins and 0 profiles:
-- 417ed3ad-3270-412c-814b-6d77f0fdf073. This lists every workspace, open or closed, with no profile in it
-- that is its owner or admin by the role the server's checks read (lib/governance roleOf: the active
-- membership's role, else the profile's own users.role, else viewer). A workspace with no profile at all is
-- one of them (profiles = 0).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, in a READ ONLY transaction that ends in ROLLBACK. Ids, counts, dates, plan
-- names and statuses only -- no workspace or person names, addresses, tokens or Stripe ids. Sri runs it;
-- NOT run from Claude Code. Nothing here cleans anything up: Sri decides after reading it.
--
-- Query 1, one row per such workspace:
--   sample_audit_workspace   the public sample audit's own workspace (lib/sample-audit/synthetic-org.ts,
--                            slug "__sample__"): it never has a profile, by design.
--   created, closed_at       organizations.created_at (date) and deleted_at.
--   profiles                 profiles whose workspace it is (users.organization_id); 0 = nobody can open it.
--   owner_admin_memberships_elsewhere  active owner/admin memberships held by a profile that lives in
--                            another workspace: they get its emails (B1, 31 Oct), but can't open it.
--   workspace_tier           organizations.tier (the column sign-up sets; plans are read from subscriptions).
--   subscription_tier, subscription_status, cancel_at_period_end, period_end
--                            its latest subscription row; status active, trialing, past_due or unpaid
--                            means Stripe may still be charging.
--   live_brands, deleted_brands, active_audit_schedules, active_report_schedules, pending_invites
--                            pending = not accepted, not expired.
--   last_audit, audits_last_30_days, audits_running_now   anything still costing money.
-- Query 2, the same workspaces: where each one came from.
--   made_by_sample_audit     its better-auth link is the sample audit's ("sample_<time>").
--   auth_org_members         better-auth members of the organisation it was made for.
--   members_with_profile_elsewhere  of those, accounts whose profile is in another workspace: the account
--                            already had one when it made this (lib/auth/server.ts provisionAppWorkspace
--                            keeps that profile where it is and still saves this workspace's row).
--   members_with_no_profile  accounts that never got a profile anywhere.
--
-- Expected, by how a workspace ends up with nobody in it (the 8 Nov report has the code paths):
--   sample_audit_workspace = t: the public sample audit's own workspace. Empty by design; its recent
--     audits are sample audits, under the sample daily cap.
--   members_with_profile_elsewhere > 0: an account that already had a workspace made another (POST
--     /api/auth/workspace, or better-auth's organization/create): the new row was saved with no profile.
--     Still possible after this push.
--   profiles = 0 and owner_admin_memberships_elsewhere > 0: its only owner switched to another workspace
--     ("Switch to <org>", 678bfb0, live since the 8 Nov push). From now on only an empty free one can be
--     left like that.
--   closed_at set: closed by a prod-fix; the crons already skip it.
-- A row with an uncancelled subscription, schedules, or audits in the last 30 days is one still costing
-- money. Nothing here changes anything: Sri decides what, if anything, to clean up.

BEGIN TRANSACTION READ ONLY;

-- 1. Every workspace nobody can manage, and what's still in it.
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
),
nobody AS (
  SELECT o.id AS organization_id, count(e.role) AS profiles
  FROM organizations o
  LEFT JOIN effective e ON e.organization_id = o.id
  GROUP BY o.id
  HAVING count(e.role) FILTER (WHERE e.role IN ('owner', 'admin')) = 0
)
SELECT
  o.id AS organization_id,
  (o.slug = '__sample__' OR coalesce(o.metadata ->> 'isSampleOrg', '') = 'true') AS sample_audit_workspace,
  o.created_at::date AS created,
  o.deleted_at AS closed_at,
  n.profiles,
  (SELECT count(*) FROM org_members m
     JOIN users u ON u.id = m.user_id
   WHERE m.organization_id = o.id AND m.is_active AND m.role IN ('owner', 'admin')
     AND u.organization_id <> o.id) AS owner_admin_memberships_elsewhere,
  o.tier AS workspace_tier,
  s.tier AS subscription_tier,
  s.status AS subscription_status,
  s.cancel_at_period_end,
  s.current_period_end::date AS period_end,
  (SELECT count(*) FROM brands b WHERE b.organization_id = o.id AND b.deleted_at IS NULL) AS live_brands,
  (SELECT count(*) FROM brands b WHERE b.organization_id = o.id AND b.deleted_at IS NOT NULL) AS deleted_brands,
  (SELECT count(*) FROM audit_schedules a
   WHERE a.organization_id = o.id AND a.status = 'active') AS active_audit_schedules,
  (SELECT count(*) FROM report_delivery_schedules r
   WHERE r.organization_id = o.id AND r.is_active) AS active_report_schedules,
  (SELECT count(*) FROM org_members m
   WHERE m.organization_id = o.id AND m.accepted_at IS NULL AND m.invitation_token IS NOT NULL
     AND m.expires_at > now()) AS pending_invites,
  (SELECT max(a.created_at) FROM audits a WHERE a.organization_id = o.id)::date AS last_audit,
  (SELECT count(*) FROM audits a
   WHERE a.organization_id = o.id AND a.created_at > now() - interval '30 days') AS audits_last_30_days,
  (SELECT count(*) FROM audits a
   WHERE a.organization_id = o.id AND a.status IN ('pending', 'running')) AS audits_running_now
FROM nobody n
JOIN organizations o ON o.id = n.organization_id
LEFT JOIN LATERAL (
  SELECT sub.tier, sub.status, sub.cancel_at_period_end, sub.current_period_end
  FROM subscriptions sub
  WHERE sub.organization_id = o.id
  ORDER BY sub.updated_at DESC
  LIMIT 1
) s ON true
ORDER BY (o.deleted_at IS NOT NULL), o.created_at;

-- 2. The same workspaces: where each came from.
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
),
nobody AS (
  SELECT o.id AS organization_id
  FROM organizations o
  LEFT JOIN effective e ON e.organization_id = o.id
  GROUP BY o.id
  HAVING count(e.role) FILTER (WHERE e.role IN ('owner', 'admin')) = 0
)
SELECT
  o.id AS organization_id,
  o.clerk_org_id LIKE 'sample\_%' AS made_by_sample_audit,
  EXISTS (SELECT 1 FROM auth_organizations ao WHERE ao.id = o.clerk_org_id) AS has_auth_org,
  (SELECT count(*) FROM auth_members am WHERE am.organization_id = o.clerk_org_id) AS auth_org_members,
  (SELECT count(*) FROM auth_members am
     JOIN users u ON u.clerk_user_id = am.user_id
   WHERE am.organization_id = o.clerk_org_id AND u.organization_id <> o.id) AS members_with_profile_elsewhere,
  (SELECT count(*) FROM auth_members am
   WHERE am.organization_id = o.clerk_org_id
     AND NOT EXISTS (SELECT 1 FROM users u WHERE u.clerk_user_id = am.user_id)) AS members_with_no_profile
FROM nobody n
JOIN organizations o ON o.id = n.organization_id
ORDER BY (o.deleted_at IS NOT NULL), o.created_at;

ROLLBACK;
