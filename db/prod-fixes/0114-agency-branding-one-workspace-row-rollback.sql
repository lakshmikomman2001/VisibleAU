-- 0114-agency-branding-one-workspace-row-rollback.sql (Vunnara, 2 Nov,
-- "where does Sri set the agency name and logo for the report cover?",
-- part 3)
--
-- ONLY IF run2 HAS TO BE UNDONE, and only BEFORE run4 (it restores from
-- _backup_0114_agency_brand_assets). Not part of the normal run1-run4.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. ONE
-- transaction. Drops the partial unique index and puts back every
-- workspace-wide row run2 deleted, exactly as backed up (same ids and
-- values). The pushed code reads the newest row either way, so this
-- changes nothing anyone sees -- it only brings the duplicates back.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then index_present =
-- f and missing_backup_rows = 0.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public._backup_0114_agency_brand_assets') IS NULL THEN
    RAISE EXCEPTION '0114 rollback: _backup_0114_agency_brand_assets is gone (run4 has run); nothing to restore from';
  END IF;
END $$;

DROP INDEX IF EXISTS agency_brand_assets_one_workspace_row;

INSERT INTO agency_brand_assets
SELECT b.* FROM _backup_0114_agency_brand_assets b
WHERE NOT EXISTS (SELECT 1 FROM agency_brand_assets a WHERE a.id = b.id);

COMMIT;

SELECT
  to_regclass('public.agency_brand_assets_one_workspace_row') IS NOT NULL AS index_present,
  (SELECT count(*) FROM _backup_0114_agency_brand_assets b
   WHERE NOT EXISTS (SELECT 1 FROM agency_brand_assets a WHERE a.id = b.id)) AS missing_backup_rows;
