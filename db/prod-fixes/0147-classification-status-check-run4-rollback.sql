-- 0147-classification-status-check-run4-rollback.sql (14 Nov): undoes run2. Only if run2 must be undone.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Sri-authorized only. NOT run from Claude Code.
-- Leaves the column with no CHECK, as production was before run2 if run1's query 1 returned no row. (If run1
-- showed a four-value CHECK, don't restore it: it rejects needs_confirmation, which the app writes.)
BEGIN;

ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_classification_status_check;

COMMIT;

-- Expected: no row.
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.brands'::regclass AND conname = 'brands_classification_status_check';
