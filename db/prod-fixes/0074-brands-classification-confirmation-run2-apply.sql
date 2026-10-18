-- 0074-brands-classification-confirmation-run2-apply.sql (Vunnara Build
-- 1, Part C)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Nullable / no-default columns (except categories, empty-array
-- default) -- metadata-only on Postgres, no table rewrite.
--
-- Expected result: "Statement executed successfully", then all four
-- *_present = t, and classification_status's existing values are
-- untouched (it's a plain text column with an application-level enum,
-- not a Postgres ENUM TYPE -- no DDL needed to add "needs_confirmation"
-- as a 5th allowed value).
BEGIN;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS classification_error text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS category_confirmed_at timestamptz;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}' NOT NULL;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'classification_error') AS classification_error_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'category_confirmed_at') AS category_confirmed_at_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'audience') AS audience_present,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'categories') AS categories_present;
