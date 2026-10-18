-- 0077-audits-methodology-version-run3-post-check.sql (Vunnara Build
-- 1, Part G.7)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: methodology_version_present = t,
-- every_existing_row_reads_as_one = t.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'methodology_version') AS methodology_version_present,
  (SELECT count(*) = 0 FROM audits WHERE methodology_version IS DISTINCT FROM 1) AS every_existing_row_reads_as_one;
