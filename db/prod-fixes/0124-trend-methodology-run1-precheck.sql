-- 0124-trend-methodology-run1-precheck.sql (Vunnara, 6 Nov, "Mention
-- detection", part 6)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that writes the column -- inngest/functions/aggregate-
-- visibility-trend.ts writes visibility_trends.methodology_version on every
-- row it writes, and would fail (42703, column does not exist) until run2
-- has run.
-- Mirrors db/migrations/0124_visibility_trends_methodology_version.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration only adds one nullable column; no existing
-- row changes.
--
-- Expected result: one row -- methodology_version_present = f, and the row
-- count.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visibility_trends' AND column_name = 'methodology_version'
  ) AS methodology_version_present,
  (SELECT count(*) FROM visibility_trends) AS trend_rows;
