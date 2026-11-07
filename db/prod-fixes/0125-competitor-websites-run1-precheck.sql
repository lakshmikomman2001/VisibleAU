-- 0125-competitor-websites-run1-precheck.sql (Vunnara, 7 Nov, "Fair
-- competitor counting", Sri's decision 4)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that reads the column -- every brands query in the new
-- code selects brands.competitor_websites, and would fail (42703, column does
-- not exist) until run2 has run.
-- Mirrors db/migrations/0125_brands_competitor_websites.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration only adds one column with a constant
-- default; no existing value changes.
--
-- Expected result: one row -- competitor_websites_present = f, the brand
-- count, and how many brands have competitors (each of those will show
-- "can't be verified: add their websites in brand settings" until a website
-- is added).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'competitor_websites'
  ) AS competitor_websites_present,
  (SELECT count(*) FROM brands WHERE deleted_at IS NULL) AS brands,
  (SELECT count(*) FROM brands WHERE deleted_at IS NULL AND cardinality(competitors) > 0)
    AS brands_with_competitors;
