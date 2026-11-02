-- diag-0119-newly-gated-features.sql
-- "Server-side plan checks for the paid features that have none" (Sri, 3 Nov)
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECT statements only. Paste into the
-- Neon SQL editor. NOT run from Claude Code -- there is no prod access from that
-- environment. Sri-authorized only.
--
-- Run BEFORE the push. It shows every workspace already using a feature its plan
-- doesn't include, so you can move it up first. Nothing is deleted at the push:
-- what it has stays, and works again if it moves up.
--
-- At the push, on a plan without the feature:
-- - client portal: no new links. Existing links keep working, and can be revoked.
-- - webhooks: nothing is sent; endpoints can't be changed or tested, only deleted.
-- - bulk operations and GA4: refused, and GA4 stops pushing.
-- - seats: no new invite. Nobody already in the workspace is removed.
--
-- The plan columns below use the same rule as lib/pricing/effective-tier.ts. Prints
-- ids, plans and counts only: no names, addresses, URLs or secrets.
--
-- Expected: one row per workspace. Empty means nobody is affected. The Splice
-- Marketing workspace would show here if it's on Agency and uses bulk or GA4.

WITH plan AS (
  SELECT
    o.id AS organization_id,
    o.deleted_at IS NOT NULL AS closed,
    CASE
      WHEN s.organization_id IS NULL THEN 'free'
      WHEN s.status IN ('canceled', 'incomplete_expired') THEN 'free'
      WHEN s.cancel_at_period_end
        AND s.current_period_end <= now()
        AND (s.current_period_start IS NULL
          OR s.current_period_end - s.current_period_start >= interval '1 day') THEN 'free'
      ELSE s.tier
    END AS plan
  FROM organizations o
  LEFT JOIN subscriptions s ON s.organization_id = o.id
),
usage AS (
  SELECT
    p.organization_id,
    p.closed,
    p.plan,
    (SELECT count(*) FROM client_portal_invites i
      WHERE i.organization_id = p.organization_id AND NOT i.is_revoked) AS portal_links,
    (SELECT count(*) FROM webhook_endpoints w
      WHERE w.organization_id = p.organization_id AND w.is_active) AS active_webhooks,
    (SELECT count(*) FROM bulk_operations b
      WHERE b.organization_id = p.organization_id) AS bulk_operations_run,
    (SELECT o.ga4_measurement_id IS NOT NULL FROM organizations o
      WHERE o.id = p.organization_id) AS ga4_configured,
    (SELECT count(*) FROM org_members m
      WHERE m.organization_id = p.organization_id
        AND (m.is_active OR m.accepted_at IS NULL)) AS seats_used,
    CASE p.plan
      WHEN 'agency' THEN 5
      WHEN 'agency_pro' THEN 15
      WHEN 'enterprise' THEN NULL
      ELSE 1
    END AS seats_included
  FROM plan p
)
SELECT
  organization_id,
  closed,
  plan,
  portal_links,
  active_webhooks,
  bulk_operations_run,
  ga4_configured,
  seats_used,
  seats_included
FROM usage
WHERE (plan NOT IN ('agency', 'agency_pro', 'enterprise') AND (portal_links > 0 OR active_webhooks > 0))
   OR (plan NOT IN ('agency_pro', 'enterprise') AND (bulk_operations_run > 0 OR ga4_configured))
   OR (seats_included IS NOT NULL AND seats_used > seats_included)
ORDER BY closed, plan, organization_id;
