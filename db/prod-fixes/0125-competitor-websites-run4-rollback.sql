-- 0125-competitor-websites-run4-rollback.sql (Vunnara, 7 Nov, "Fair
-- competitor counting", Sri's decision 4)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that reads the column has been rolled back -- every
-- brands query in it selects brands.competitor_websites, so dropping the
-- column while that code is live fails every brand page and job with 42703.
--
-- Dropping the column loses the competitor websites people added since
-- run2. Back them up first if any exist (run3's brands_with_websites > 0):
--   SELECT id, competitor_websites FROM brands WHERE competitor_websites <> '{}'::jsonb;
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- competitor_websites_present = f.
BEGIN;

ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_competitor_websites_is_object;
ALTER TABLE brands DROP COLUMN IF EXISTS competitor_websites;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'competitor_websites'
  ) AS competitor_websites_present;
