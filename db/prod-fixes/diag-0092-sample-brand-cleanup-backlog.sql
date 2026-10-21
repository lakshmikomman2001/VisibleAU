-- diag-0092-sample-brand-cleanup-backlog.sql (Vunnara, 21 Oct, "audit
-- reliability", Part C, item 7)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT
-- run from Claude Code -- there is no prod access from that
-- environment. Sri-authorized only.
--
-- Safe to run any time, before or after the push: every query here is
-- a plain SELECT, never a write. Can be run again after the push's
-- first 03:00 UTC nightly sampleAuditCleanup tick to confirm the
-- backlog actually cleared -- no prod-fix data change is needed, the
-- fixed job does it on its own next run.
--
-- WHY: sample-audit-cleanup.ts used to hard-delete a __sample__
-- brand straight after its audits, but action_items (and sometimes
-- drift_alerts) still reference that brand with NO ACTION foreign
-- keys -- the delete threw for any sample that had produced a
-- recommendation, and the brand (with all its audits/citations/
-- action_items/drift_alerts) was left behind instead of being
-- removed. This has likely been happening since whichever deploy
-- first let a sample audit generate a recommendation, well before
-- this fix -- the counts below are that backlog.

-- Result 1: how many __sample__ brands are past the cleanup window
-- (every audit they have is older than 24h, so a correctly-working
-- job would already have removed them) -- and their child-row counts,
-- by table, so the scale of the backlog is visible before the fix's
-- first nightly run clears it.
WITH sample_org AS (
  SELECT id FROM organizations WHERE slug = '__sample__'
),
stale_brands AS (
  SELECT b.id AS brand_id, b.domain, b.created_at AS brand_created_at
  FROM brands b
  JOIN sample_org o ON b.organization_id = o.id
  WHERE b.id IN (
    SELECT a.brand_id
    FROM audits a
    JOIN sample_org o2 ON a.organization_id = o2.id
    GROUP BY a.brand_id
    HAVING max(a.created_at) < now() - interval '24 hours'
  )
)
SELECT
  sb.brand_id,
  sb.domain,
  sb.brand_created_at,
  (SELECT count(*) FROM audits WHERE brand_id = sb.brand_id) AS audit_count,
  (SELECT count(*) FROM citations c JOIN audits a ON a.id = c.audit_id WHERE a.brand_id = sb.brand_id) AS citation_count,
  (SELECT count(*) FROM engine_call_failures f JOIN audits a ON a.id = f.audit_id WHERE a.brand_id = sb.brand_id) AS engine_call_failure_count,
  (SELECT count(*) FROM action_items WHERE brand_id = sb.brand_id) AS action_item_count,
  (SELECT count(*) FROM drift_alerts WHERE brand_id = sb.brand_id) AS drift_alert_count
FROM stale_brands sb
ORDER BY sb.brand_created_at ASC;

-- Result 2: totals across the whole backlog, and the oldest brand
-- found -- a quick single-row "how bad is it" summary.
WITH sample_org AS (
  SELECT id FROM organizations WHERE slug = '__sample__'
),
stale_brands AS (
  SELECT b.id AS brand_id, b.created_at AS brand_created_at
  FROM brands b
  JOIN sample_org o ON b.organization_id = o.id
  WHERE b.id IN (
    SELECT a.brand_id
    FROM audits a
    JOIN sample_org o2 ON a.organization_id = o2.id
    GROUP BY a.brand_id
    HAVING max(a.created_at) < now() - interval '24 hours'
  )
)
SELECT
  count(*) AS stale_sample_brands,
  min(brand_created_at) AS oldest_stale_brand_created_at,
  (SELECT count(*) FROM action_items WHERE brand_id IN (SELECT brand_id FROM stale_brands)) AS total_action_items,
  (SELECT count(*) FROM drift_alerts WHERE brand_id IN (SELECT brand_id FROM stale_brands)) AS total_drift_alerts
FROM stale_brands;
