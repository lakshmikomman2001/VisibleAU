-- 0096-action-items-latest-audit-dismiss-run3-post-check.sql
-- "The Action Center shows each brand's latest audit only" (23 Oct), item 1
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- Read-only. Sri-authorized only. NOT run from Claude Code.
--
-- Two checks. Expected result: both return 0. If either doesn't, do
-- not proceed -- send Claude a screenshot.

-- 1. Every row run2-apply touched now looks exactly right.
SELECT count(*) AS remaining_wrong_count
FROM action_items
WHERE id IN (SELECT id FROM _backup_0096_action_items)
  AND (
    status <> 'dismissed'
    OR dismissed_reason IS DISTINCT FROM 'Replaced by a newer audit'
    OR dismissed_at IS NULL
  );

-- 2. The broader invariant run2-apply was meant to establish: no brand
-- with a complete audit has an open item outside that audit anymore
-- ("only latest-audit opens remain").
WITH latest_complete AS (
  SELECT DISTINCT ON (brand_id) brand_id, id AS audit_id
  FROM audits
  WHERE status = 'complete'
  ORDER BY brand_id, completed_at DESC, id DESC
)
SELECT count(*) AS still_out_of_scope_open_count
FROM action_items ai
JOIN latest_complete lc ON lc.brand_id = ai.brand_id
WHERE ai.status = 'open'
  AND ai.audit_id <> lc.audit_id;
