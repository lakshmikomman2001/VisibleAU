-- 0074-brands-classification-confirmation-rollback.sql (Vunnara Build
-- 1, Part C)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- safe
-- only BEFORE the code that reads/writes these columns is deployed
-- (same caveat as every additive-migration rollback this task has
-- written). If the deploy already happened, re-run run2-apply.sql
-- instead (idempotent, IF NOT EXISTS) rather than dropping columns
-- live code depends on.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then all four
-- *_present = f.
BEGIN;

ALTER TABLE brands DROP COLUMN IF EXISTS classification_error;
ALTER TABLE brands DROP COLUMN IF EXISTS category_confirmed_at;
ALTER TABLE brands DROP COLUMN IF EXISTS audience;
ALTER TABLE brands DROP COLUMN IF EXISTS categories;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'classification_error') AS classification_error_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'category_confirmed_at') AS category_confirmed_at_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'audience') AS audience_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'categories') AS categories_present;
