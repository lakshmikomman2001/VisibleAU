-- diag-0112-brands-named-like-agency.sql
-- "Upload instead does nothing in Brand basics, and where does Sri set the
-- AGENCY name and logo for the report cover?" (2 Nov), part 1
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECT statements only. Paste into
-- the Neon SQL editor. NOT run from Claude Code -- there is no prod access
-- from that environment. Sri-authorized only.
--
-- "Brand basics" is step 1 of the NEW-BRAND wizard (/brands/wizard). Its
-- last step creates a row in `brands` and starts that brand's first audit.
-- The report PDF's agency name and logo come from `agency_brand_assets`,
-- never from a brand. This checks whether the Splice Marketing workspace
-- has a BRAND named after itself (made by accident while looking for the
-- agency settings), and whether its agency branding rows are in order.
--
-- Prints ids, counts, timestamps and yes/no flags only: no names, domains,
-- emails, URLs or text values. The workspace is found by its name
-- ("Splice Marketing", ignoring case, spaces and punctuation) in the WHERE
-- clauses only.
--
-- Expected: query 1 shows the workspace(s); query 2 is empty unless a brand
-- named "Splice Marketing" / splicemarketing.com.au was created; query 3
-- lists any workspace with a brand named after the workspace itself;
-- queries 4 and 5 show the agency branding rows (see their notes).

-- 1. The Splice Marketing workspace(s): when made, open or closed, plan,
-- how many brands and members.
SELECT
  o.id AS organization_id,
  (o.created_at AT TIME ZONE 'Australia/Sydney') AS created_sydney,
  o.deleted_at IS NOT NULL AS closed,
  s.tier,
  s.status AS subscription_status,
  (SELECT count(*) FROM brands b
    WHERE b.organization_id = o.id AND b.deleted_at IS NULL) AS open_brands,
  (SELECT count(*) FROM brands b
    WHERE b.organization_id = o.id AND b.deleted_at IS NOT NULL) AS deleted_brands,
  (SELECT count(*) FROM org_members m
    WHERE m.organization_id = o.id AND m.is_active) AS active_members
FROM organizations o
LEFT JOIN subscriptions s ON s.organization_id = o.id
WHERE lower(regexp_replace(o.name, '[^a-zA-Z0-9]', '', 'g')) LIKE '%splicemarketing%'
ORDER BY o.created_at;

-- 2. Brands in that workspace named or addressed like the workspace itself
-- ("Splice Marketing" / splicemarketing.com.au): when made (Sydney),
-- deleted or not, and whether audits ran on them (each audit costs money,
-- and the wizard starts one as soon as the brand is created).
SELECT
  b.organization_id,
  b.id AS brand_id,
  (b.created_at AT TIME ZONE 'Australia/Sydney') AS created_sydney,
  b.deleted_at IS NOT NULL AS deleted,
  lower(regexp_replace(b.name, '[^a-zA-Z0-9]', '', 'g')) = 'splicemarketing' AS name_matches,
  lower(regexp_replace(b.domain, '^(https?://)?(www\.)?', '')) LIKE 'splicemarketing.%' AS domain_matches,
  (SELECT count(*) FROM audits a WHERE a.brand_id = b.id) AS audits,
  (SELECT count(*) FROM audits a WHERE a.brand_id = b.id AND a.status = 'complete') AS complete_audits,
  (SELECT min(a.created_at) AT TIME ZONE 'Australia/Sydney' FROM audits a WHERE a.brand_id = b.id)
    AS first_audit_sydney,
  (SELECT a.status FROM audits a WHERE a.brand_id = b.id ORDER BY a.created_at DESC LIMIT 1)
    AS latest_audit_status,
  (SELECT count(*) FROM generated_reports r WHERE r.brand_id = b.id) AS reports
FROM brands b
JOIN organizations o ON o.id = b.organization_id
WHERE lower(regexp_replace(o.name, '[^a-zA-Z0-9]', '', 'g')) LIKE '%splicemarketing%'
  AND (
    lower(regexp_replace(b.name, '[^a-zA-Z0-9]', '', 'g')) LIKE '%splicemarketing%'
    OR lower(regexp_replace(b.domain, '^(https?://)?(www\.)?', '')) LIKE 'splicemarketing.%'
  )
ORDER BY b.created_at;

-- 3. Every workspace: brands named exactly like their own workspace
-- (ignoring case, spaces and punctuation) -- the same mistake elsewhere.
SELECT
  o.id AS organization_id,
  b.id AS brand_id,
  (b.created_at AT TIME ZONE 'Australia/Sydney') AS created_sydney,
  b.deleted_at IS NOT NULL AS deleted,
  (SELECT count(*) FROM audits a WHERE a.brand_id = b.id) AS audits
FROM brands b
JOIN organizations o ON o.id = b.organization_id
WHERE lower(regexp_replace(b.name, '[^a-zA-Z0-9]', '', 'g'))
    = lower(regexp_replace(o.name, '[^a-zA-Z0-9]', '', 'g'))
ORDER BY b.created_at;

-- 4. The Splice Marketing workspace's agency branding rows -- what the
-- report cover reads. scope = 'workspace' (brand_id IS NULL) or 'brand'.
-- More than one 'workspace' row is the save bug fixed on 2 Nov: the
-- unique index treats NULL brand_ids as distinct, so every save from
-- /agency/branding added a row instead of updating it, and readers took
-- whichever row came first. Flags only, no values.
SELECT
  aba.organization_id,
  aba.id AS asset_id,
  CASE WHEN aba.brand_id IS NULL THEN 'workspace' ELSE 'brand' END AS scope,
  aba.brand_id,
  (aba.updated_at AT TIME ZONE 'Australia/Sydney') AS updated_sydney,
  aba.agency_name IS NOT NULL AND btrim(aba.agency_name) <> '' AS agency_name_set,
  aba.logo_url IS NOT NULL AND btrim(aba.logo_url) <> '' AS logo_set,
  aba.footer_text IS NOT NULL AND btrim(aba.footer_text) <> '' AS footer_set,
  aba.contact_line IS NOT NULL AND btrim(aba.contact_line) <> '' AS contact_set
FROM agency_brand_assets aba
JOIN organizations o ON o.id = aba.organization_id
WHERE lower(regexp_replace(o.name, '[^a-zA-Z0-9]', '', 'g')) LIKE '%splicemarketing%'
ORDER BY scope DESC, aba.updated_at DESC;

-- 5. Every workspace with more than one workspace-wide branding row (the
-- same save bug): how many, and when the newest was saved.
SELECT
  aba.organization_id,
  count(*) AS workspace_rows,
  (max(aba.updated_at) AT TIME ZONE 'Australia/Sydney') AS newest_saved_sydney
FROM agency_brand_assets aba
WHERE aba.brand_id IS NULL
GROUP BY aba.organization_id
HAVING count(*) > 1
ORDER BY workspace_rows DESC;
