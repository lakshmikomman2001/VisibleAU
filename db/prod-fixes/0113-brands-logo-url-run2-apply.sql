-- 0113-brands-logo-url-run2-apply.sql (Vunnara, 2 Nov, "Upload instead
-- does nothing in Brand basics", part 2)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql, and BEFORE the push (the new
-- code reads this column from the moment it deploys).
-- Sri-authorized only. NOT run from Claude Code.
--
-- ADD COLUMN is metadata-only (nullable, no default): no row rewrite, no
-- long lock.
--
-- Expected result: "Statement executed successfully", then one row with
-- column_present = t.
BEGIN;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'logo_url'
  ) AS column_present;
