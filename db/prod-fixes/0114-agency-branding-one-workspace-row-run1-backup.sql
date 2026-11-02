-- 0114-agency-branding-one-workspace-row-run1-backup.sql (Vunnara, 2 Nov,
-- "where does Sri set the agency name and logo for the report cover?",
-- part 3)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Run
-- FIRST, then run2. Mirrors db/migrations/
-- 0114_agency_brand_assets_one_workspace_row.sql, with a backup first.
-- Run AFTER the push: until then the old /agency/branding save adds a new
-- workspace row on every save, and once run2's index exists that save
-- would fail instead (23505). The pushed code saves in place.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Why: the unique index on (organization_id, brand_id) treats NULL
-- brand_ids as distinct, so every save of the workspace-wide branding
-- (brand_id IS NULL) added a row, and the report, the client portal and
-- the audit export each read whichever row came first.
--
-- Stops (an exception, nothing created) if the backup table already exists
-- (run1 has run: go on to run2, or run4 to drop it). Then copies EVERY
-- workspace-wide row -- duplicated or not, all columns -- into
-- _backup_0114_agency_brand_assets, so the rollback file can put back any
-- row run2 removes.
--
-- Expected result: tab 1 "Statement executed successfully"; tab 2 one
-- row -- the counts as they really are, backup_rows = workspace_rows,
-- and rows_run2_will_remove = workspace_rows - workspaces_with_a_row
-- (0 if there are no duplicates; run2 is still needed for the index).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public._backup_0114_agency_brand_assets') IS NOT NULL THEN
    RAISE EXCEPTION '0114 run1: _backup_0114_agency_brand_assets already exists -- run1 has run; go on to run2, or run4 to drop it';
  END IF;
END $$;

CREATE TABLE _backup_0114_agency_brand_assets AS
SELECT * FROM agency_brand_assets WHERE brand_id IS NULL;

COMMIT;

SELECT
  (SELECT count(*) FROM agency_brand_assets WHERE brand_id IS NULL) AS workspace_rows,
  (SELECT count(DISTINCT organization_id) FROM agency_brand_assets WHERE brand_id IS NULL)
    AS workspaces_with_a_row,
  (SELECT count(*) FROM (
     SELECT organization_id FROM agency_brand_assets WHERE brand_id IS NULL
     GROUP BY organization_id HAVING count(*) > 1) d) AS workspaces_with_duplicates,
  (SELECT count(*) FROM agency_brand_assets WHERE brand_id IS NULL)
    - (SELECT count(DISTINCT organization_id) FROM agency_brand_assets WHERE brand_id IS NULL)
    AS rows_run2_will_remove,
  (SELECT count(*) FROM agency_brand_assets WHERE brand_id IS NOT NULL) AS brand_override_rows,
  (SELECT count(*) FROM _backup_0114_agency_brand_assets) AS backup_rows,
  to_regclass('public.agency_brand_assets_one_workspace_row') IS NOT NULL AS index_present;
