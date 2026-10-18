-- 0077-audits-methodology-version-run1-precheck.sql (Vunnara Build 1,
-- Part G.7)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run BEFORE run2-apply.sql, and BEFORE pushing the code that reads/
-- writes this column (additive migration -- apply before push).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Mirrors db/migrations/0050_audits_methodology_version.sql exactly.
--
-- Expected result: methodology_version_present = f.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'methodology_version') AS methodology_version_present;
