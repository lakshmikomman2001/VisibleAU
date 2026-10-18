-- 0074-brands-classification-confirmation-run3-post-check.sql (Vunnara
-- Build 1, Part C)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: all four *_present = t, categories_default_is_empty
-- = t (no existing brand row got a non-empty categories array it didn't
-- ask for).
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'classification_error') AS classification_error_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'category_confirmed_at') AS category_confirmed_at_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'audience') AS audience_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'categories') AS categories_present,
  (SELECT count(*) = 0 FROM brands WHERE categories <> '{}') AS categories_default_is_empty;
