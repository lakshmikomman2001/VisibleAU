-- 0075-brands-location-confirmation-run2-apply.sql (Vunnara Build 1,
-- Part D)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then all six
-- *_present = t, and no existing brand row got a non-null value it
-- didn't ask for (no backfill, per NO MOCK DATA IN PRODUCTION).
BEGIN;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS suburb text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS location_mode text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS location_confirmed_at timestamptz;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'suburb') AS suburb_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'city') AS city_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'state') AS state_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'country') AS country_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'location_mode') AS location_mode_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'location_confirmed_at') AS location_confirmed_at_present,
  (SELECT count(*) = 0 FROM brands WHERE location_confirmed_at IS NOT NULL) AS no_brand_backfilled;
