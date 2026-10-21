-- 0086-brand-directory-listings-run1-precheck.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part C)
--
-- PRODUCTION branch. Run on its own, as one editor submission.
-- READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE pushing the code
-- that reads/writes this table (new table -- apply before push, same
-- as every other additive schema change).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Mirrors db/migrations/0086_brand_directory_listings.sql exactly.
--
-- Expected result: table_present = f.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'brand_directory_listings'
  ) AS table_present;
