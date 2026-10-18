-- 0074-brands-classification-confirmation-run1-precheck.sql (Vunnara
-- Build 1, Part C)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run BEFORE run2-apply.sql, and BEFORE pushing the code that reads/
-- writes these columns (additive migration -- apply before push).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Mirrors db/migrations/0047_brands_classification_confirmation.sql
-- exactly.
--
-- Expected result: all four *_present = f.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'classification_error') AS classification_error_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'category_confirmed_at') AS category_confirmed_at_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'audience') AS audience_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'categories') AS categories_present;
