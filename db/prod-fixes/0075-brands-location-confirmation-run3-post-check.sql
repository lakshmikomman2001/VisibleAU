-- 0075-brands-location-confirmation-run3-post-check.sql (Vunnara
-- Build 1, Part D)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: all six *_present = t, no_brand_backfilled = t.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'suburb') AS suburb_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'city') AS city_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'state') AS state_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'country') AS country_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'location_mode') AS location_mode_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'location_confirmed_at') AS location_confirmed_at_present,
  (SELECT count(*) = 0 FROM brands WHERE location_confirmed_at IS NOT NULL) AS no_brand_backfilled;
