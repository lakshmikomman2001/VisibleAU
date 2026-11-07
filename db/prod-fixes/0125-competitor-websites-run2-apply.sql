-- 0125-competitor-websites-run2-apply.sql (Vunnara, 7 Nov, "Fair competitor
-- counting", Sri's decision 4)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Run
-- AFTER run1-precheck.sql, and BEFORE the push. ADD COLUMN with a constant
-- default is metadata-only on Postgres 11+ (no row rewrite); the CHECK is
-- validated against existing rows, which all hold the default '{}'.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then one row with
-- competitor_websites_present = t and check_present = t.
BEGIN;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS competitor_websites jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_competitor_websites_is_object'
  ) THEN
    ALTER TABLE brands
      ADD CONSTRAINT brands_competitor_websites_is_object
      CHECK (jsonb_typeof(competitor_websites) = 'object');
  END IF;
END $$;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'competitor_websites'
  ) AS competitor_websites_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_competitor_websites_is_object'
  ) AS check_present;
