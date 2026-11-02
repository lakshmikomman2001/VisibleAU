-- 0114-agency-branding-one-workspace-row-run3-post-check.sql (Vunnara, 2
-- Nov, "where does Sri set the agency name and logo for the report
-- cover?", part 3)
--
-- PRODUCTION branch (Neon). READ-ONLY: one SELECT. Run AFTER
-- run2-apply.sql, while _backup_0114_agency_brand_assets exists (before
-- run4). Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: every row's result is PASS. Any FAIL: don't run run4;
-- send Claude the rows (counts only). After the rollback file, checks 1,
-- 2 and 4 read FAIL -- expected.
WITH idx AS (
  SELECT i.indisunique, i.indisvalid, pg_get_expr(i.indpred, i.indrelid) AS predicate
  FROM pg_index i
  WHERE i.indexrelid = to_regclass('public.agency_brand_assets_one_workspace_row')
),
kept AS (
  -- The newest backed-up row of each workspace: the one run2 kept.
  SELECT DISTINCT ON (organization_id) organization_id, id
  FROM _backup_0114_agency_brand_assets
  ORDER BY organization_id, updated_at DESC, id DESC
),
checks AS (
  SELECT 1 AS ord, 'the partial unique index exists, is valid, and covers brand_id IS NULL only'
      AS check_name, 1::bigint AS expected,
    (SELECT count(*) FROM idx
     WHERE indisunique AND indisvalid AND predicate = '(brand_id IS NULL)') AS actual
  UNION ALL
  SELECT 2, 'workspaces with more than one workspace-wide row', 0,
    (SELECT count(*) FROM (
       SELECT organization_id FROM agency_brand_assets WHERE brand_id IS NULL
       GROUP BY organization_id HAVING count(*) > 1) d)
  UNION ALL
  SELECT 3, 'backed-up workspaces left with no workspace-wide row', 0,
    (SELECT count(*) FROM kept k
     WHERE NOT EXISTS (
       SELECT 1 FROM agency_brand_assets a
       WHERE a.organization_id = k.organization_id AND a.brand_id IS NULL))
  UNION ALL
  SELECT 4, 'workspaces whose remaining row is not the newest backed-up row', 0,
    (SELECT count(*) FROM kept k
     JOIN agency_brand_assets a ON a.organization_id = k.organization_id AND a.brand_id IS NULL
     WHERE a.id <> k.id)
  UNION ALL
  SELECT 5, 'workspace-wide rows of the backed-up workspaces (exactly one each)',
    (SELECT count(*) FROM kept),
    (SELECT count(*) FROM agency_brand_assets a
     WHERE a.brand_id IS NULL AND a.organization_id IN (SELECT organization_id FROM kept))
)
SELECT
  check_name,
  expected,
  actual,
  CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY ord;
