-- 0147-classification-status-check-run2-apply.sql (14 Nov): brands.classification_status gets one CHECK with all
-- five values the app writes (pending, processing, complete, failed, needs_confirmation). Mirrors
-- db/migrations/0147_brands_classification_status_values.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri-authorized only. NOT run from Claude Code. Run AFTER run1 shows rows_outside_the_five = 0.
-- ONE transaction. Adding the CHECK scans brands once (a small table) under a brief lock.
-- RLS is unchanged; the app role's privileges on brands are unchanged.
BEGIN;

ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_classification_status_check;
ALTER TABLE brands
  ADD CONSTRAINT brands_classification_status_check
  CHECK (classification_status IN ('pending', 'processing', 'complete', 'failed', 'needs_confirmation'));

COMMIT;
