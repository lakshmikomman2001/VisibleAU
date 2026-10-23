-- diag-0096-action-items-latest-audit-scope.sql
-- "The Action Center shows each brand's latest audit only" (23 Oct), item 1
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: production showed "202 open recommendations across 4 brands",
-- dominated by one recommendation_key re-inserted by every audit for
-- Bondi Plumbing, none ever retired. Going forward, app/(auth)/action-
-- center/page.tsx shows only a brand's latest COMPLETE audit's open
-- items (plus in_progress/done from any audit), and both recommendation
-- writers (inngest/functions/generate-recommendations.ts,
-- lib/audit/run-audit-inline.ts, via the shared
-- lib/recommendations/persist.ts) dismiss a brand's older open items
-- the moment a new audit completes. This is the one-time catch-up for
-- every audit that already ran BEFORE that code existed. Run this
-- FIRST, before 0096's run1-backup, so Sri can see exactly what's
-- about to be marked dismissed, per brand, before anything is touched.
--
-- "Latest complete audit" uses the same rule as
-- lib/recommendations/latest-audit-scope.ts's latestCompleteAuditIdsByBrand:
-- one audit per brand, status = 'complete', highest completed_at, ties
-- (never actually observed) broken by id. A brand with zero complete
-- audits gets no latest_complete row at all, so every count below for
-- that brand reads 0/unaffected -- "brands with no complete audit stay
-- unchanged" (open_will_be_dismissed only ever counts rows joined to a
-- real latest_complete row).
--
-- Expected result: one row per brand. open_will_be_dismissed is what
-- run2-apply.sql is about to dismiss; open_from_latest_audit and
-- in_progress_or_done are what the Action Center will still show
-- afterwards. A brand with latest_complete_audit_id = NULL never has
-- open_will_be_dismissed > 0 (no complete audit yet -- untouched).
WITH latest_complete AS (
  SELECT DISTINCT ON (brand_id) brand_id, id AS audit_id, completed_at
  FROM audits
  WHERE status = 'complete'
  ORDER BY brand_id, completed_at DESC, id DESC
)
SELECT
  b.id AS brand_id,
  b.name AS brand_name,
  lc.audit_id AS latest_complete_audit_id,
  lc.completed_at AS latest_complete_audit_completed_at,
  count(*) FILTER (WHERE ai.status = 'open') AS open_total,
  count(*) FILTER (
    WHERE ai.status = 'open' AND lc.audit_id IS NOT NULL AND ai.audit_id = lc.audit_id
  ) AS open_from_latest_audit,
  count(*) FILTER (
    WHERE ai.status = 'open' AND lc.audit_id IS NOT NULL AND ai.audit_id <> lc.audit_id
  ) AS open_will_be_dismissed,
  count(*) FILTER (WHERE ai.status IN ('in_progress', 'done')) AS in_progress_or_done
FROM brands b
LEFT JOIN latest_complete lc ON lc.brand_id = b.id
LEFT JOIN action_items ai ON ai.brand_id = b.id
WHERE b.deleted_at IS NULL
GROUP BY b.id, b.name, lc.audit_id, lc.completed_at
ORDER BY open_will_be_dismissed DESC, b.name;

-- Overall total -- the single number run1-backup.sql's backup_row_count
-- should match.
WITH latest_complete AS (
  SELECT DISTINCT ON (brand_id) brand_id, id AS audit_id
  FROM audits
  WHERE status = 'complete'
  ORDER BY brand_id, completed_at DESC, id DESC
)
SELECT count(*) AS total_open_will_be_dismissed
FROM action_items ai
JOIN latest_complete lc ON lc.brand_id = ai.brand_id
WHERE ai.status = 'open'
  AND ai.audit_id <> lc.audit_id;
