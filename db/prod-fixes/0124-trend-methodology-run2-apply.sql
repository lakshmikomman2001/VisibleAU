-- 0124-trend-methodology-run2-apply.sql (Vunnara, 6 Nov, "Mention
-- detection", part 6)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Run
-- AFTER run1-precheck.sql, and BEFORE the push. ADD COLUMN is metadata-only
-- (nullable, no default): no row rewrite, a moment's lock.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then one row with
-- methodology_version_present = t.
BEGIN;

ALTER TABLE visibility_trends ADD COLUMN IF NOT EXISTS methodology_version integer;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visibility_trends' AND column_name = 'methodology_version'
  ) AS methodology_version_present;
