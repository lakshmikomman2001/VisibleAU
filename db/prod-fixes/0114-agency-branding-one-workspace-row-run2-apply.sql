-- 0114-agency-branding-one-workspace-row-run2-apply.sql (Vunnara, 2 Nov,
-- "where does Sri set the agency name and logo for the report cover?",
-- part 3)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql (it stops without the backup).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Keeps each workspace's NEWEST workspace-wide row -- by updated_at, then
-- id: the row the pushed code already reads and saves into -- deletes the
-- older ones, and adds a partial unique index so there can only be one.
-- Per-brand rows (brand_id set) are untouched. agency_brand_assets is
-- small, so the plain CREATE INDEX holds its lock for a moment only.
--
-- Expected result: "Statement executed successfully", then one row with
-- workspaces_with_duplicates = 0, index_present = t, and rows_removed =
-- run1's rows_run2_will_remove.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public._backup_0114_agency_brand_assets') IS NULL THEN
    RAISE EXCEPTION '0114 run2: run run1-backup.sql first (no _backup_0114_agency_brand_assets)';
  END IF;
END $$;

DELETE FROM agency_brand_assets a
USING (
  SELECT id,
    row_number() OVER (PARTITION BY organization_id ORDER BY updated_at DESC, id DESC) AS rn
  FROM agency_brand_assets
  WHERE brand_id IS NULL
) ranked
WHERE a.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS agency_brand_assets_one_workspace_row
  ON agency_brand_assets (organization_id)
  WHERE brand_id IS NULL;

COMMIT;

SELECT
  (SELECT count(*) FROM (
     SELECT organization_id FROM agency_brand_assets WHERE brand_id IS NULL
     GROUP BY organization_id HAVING count(*) > 1) d) AS workspaces_with_duplicates,
  to_regclass('public.agency_brand_assets_one_workspace_row') IS NOT NULL AS index_present,
  (SELECT count(*) FROM _backup_0114_agency_brand_assets)
    - (SELECT count(*) FROM agency_brand_assets WHERE brand_id IS NULL) AS rows_removed;
