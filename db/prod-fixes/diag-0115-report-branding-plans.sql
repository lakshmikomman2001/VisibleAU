-- diag-0115-report-branding-plans.sql
-- "White-label branding is Agency-tier only" (Sri's decision, 2 Nov)
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECT statements only. Paste into
-- the Neon SQL editor. NOT run from Claude Code -- there is no prod access
-- from that environment. Sri-authorized only.
--
-- Run BEFORE the push. From that push on, report branding works only when
-- the workspace's subscriptions row is on agency, agency_pro or enterprise
-- and isn't cancelled (lib/branding/agency-assets.ts, orgHasReportBranding).
-- Any other workspace gets a locked card, and its report PDFs, audit exports
-- and client portal stop printing its agency: "Powered by Vunnara" only. Its
-- rows stay, and print again if it moves up.
--
-- Prints ids, plans, counts and yes/no flags only: no names, domains, emails,
-- URLs or text values. The Splice Marketing workspace is found by its name
-- (ignoring case, spaces and punctuation) in the WHERE clause only.
--
-- Expected:
-- query 1 -- can_use_report_branding = t for the Splice Marketing workspace.
--   If it's f, the locked card is what you'll see after the push: put the
--   workspace on an agency plan first, or the demo cover says "Powered by
--   Vunnara" only.
-- query 2 -- the workspaces that lose printed branding at the push. Empty
--   means nobody does.
-- query 3 -- workspaces where the two tier columns disagree. The gate, like the
--   sidebar and the Agency Dashboard, reads subscriptions.tier; a row here with
--   organizations_tier on an agency plan and no subscription gets the locked
--   card.

-- 1. The Splice Marketing workspace(s): the plan, and what the gate will say.
SELECT
  o.id AS organization_id,
  o.deleted_at IS NOT NULL AS closed,
  o.tier AS organizations_tier,
  s.tier AS subscription_tier,
  s.status AS subscription_status,
  COALESCE(s.tier IN ('agency', 'agency_pro', 'enterprise') AND s.status <> 'canceled', false)
    AS can_use_report_branding
FROM organizations o
LEFT JOIN subscriptions s ON s.organization_id = o.id
WHERE lower(regexp_replace(o.name, '[^a-zA-Z0-9]', '', 'g')) LIKE '%splicemarketing%'
ORDER BY o.created_at;

-- 2. Every workspace holding branding rows it won't be able to print: what it
-- holds (counts and flags), and its plan.
SELECT
  o.id AS organization_id,
  o.deleted_at IS NOT NULL AS closed,
  s.tier AS subscription_tier,
  s.status AS subscription_status,
  count(*) FILTER (WHERE a.brand_id IS NULL) AS workspace_rows,
  count(*) FILTER (WHERE a.brand_id IS NOT NULL) AS brand_rows,
  bool_or(a.agency_name IS NOT NULL AND btrim(a.agency_name) <> '') AS agency_name_set,
  bool_or(a.logo_url IS NOT NULL AND btrim(a.logo_url) <> '') AS logo_set,
  (SELECT count(*) FROM client_portal_invites i
    WHERE i.organization_id = o.id AND NOT i.is_revoked) AS open_portal_invites
FROM agency_brand_assets a
JOIN organizations o ON o.id = a.organization_id
LEFT JOIN subscriptions s ON s.organization_id = o.id
WHERE NOT COALESCE(s.tier IN ('agency', 'agency_pro', 'enterprise') AND s.status <> 'canceled', false)
GROUP BY o.id, o.deleted_at, s.tier, s.status
ORDER BY o.id;

-- 3. Workspaces where organizations.tier and subscriptions.tier disagree (a
-- cancelled plan leaves subscriptions.tier as it was and sets
-- organizations.tier to free, so those show here too).
SELECT
  o.id AS organization_id,
  o.deleted_at IS NOT NULL AS closed,
  o.tier AS organizations_tier,
  s.tier AS subscription_tier,
  s.status AS subscription_status
FROM organizations o
LEFT JOIN subscriptions s ON s.organization_id = o.id
WHERE o.tier::text IS DISTINCT FROM COALESCE(s.tier, 'free')
ORDER BY o.id;
