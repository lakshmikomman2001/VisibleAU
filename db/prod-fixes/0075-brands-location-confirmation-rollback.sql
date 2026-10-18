-- 0075-brands-location-confirmation-rollback.sql (Vunnara Build 1,
-- Part D)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- safe
-- only BEFORE the code that reads/writes these columns is deployed.
-- If the deploy already happened, re-run run2-apply.sql instead
-- (idempotent, IF NOT EXISTS) rather than dropping columns live code
-- depends on.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then all six
-- *_present = f.
BEGIN;

ALTER TABLE brands DROP COLUMN IF EXISTS suburb;
ALTER TABLE brands DROP COLUMN IF EXISTS city;
ALTER TABLE brands DROP COLUMN IF EXISTS state;
ALTER TABLE brands DROP COLUMN IF EXISTS country;
ALTER TABLE brands DROP COLUMN IF EXISTS location_mode;
ALTER TABLE brands DROP COLUMN IF EXISTS location_confirmed_at;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'suburb') AS suburb_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'city') AS city_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'state') AS state_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'country') AS country_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'location_mode') AS location_mode_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'location_confirmed_at') AS location_confirmed_at_present;
