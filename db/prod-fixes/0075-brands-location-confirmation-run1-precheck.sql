-- 0075-brands-location-confirmation-run1-precheck.sql (Vunnara Build
-- 1, Part D)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run BEFORE run2-apply.sql, and BEFORE pushing the code that reads/
-- writes these columns (additive migration -- apply before push).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Mirrors db/migrations/0048_brands_location_confirmation.sql exactly.
--
-- Expected result: all six *_present = f.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'suburb') AS suburb_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'city') AS city_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'state') AS state_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'country') AS country_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'location_mode') AS location_mode_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'location_confirmed_at') AS location_confirmed_at_present;
