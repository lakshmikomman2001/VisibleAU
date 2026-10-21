-- 0086-brand-directory-listings-rollback.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part C)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- safe
-- only BEFORE the code that reads/writes this table is deployed (same
-- caveat as every other additive-migration rollback in this repo). If
-- the deploy already happened, DO NOT drop this table -- any owner
-- confirmation already saved would be lost. Re-run run2-apply.sql
-- instead (idempotent, IF NOT EXISTS) if something about the DDL
-- itself needs correcting.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- table_present = f.
BEGIN;

DROP TABLE IF EXISTS "brand_directory_listings";

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'brand_directory_listings'
  ) AS table_present;
