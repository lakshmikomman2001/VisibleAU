-- 0147-classification-status-check-run1-precheck.sql (14 Nov): before brands.classification_status gets one CHECK
-- listing all five values the app writes. Mirrors db/migrations/0147_brands_classification_status_values.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, any time (no code depends on it; safe before or after a push, and while an audit
-- runs). run4 only to undo run2.

-- 1. Is there a CHECK of that name today, and what does it allow? Expected on production: no row (the column has
--    no CHECK; brands reach needs_confirmation). A row with only four values would mean needs_confirmation
--    writes fail today.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.brands'::regclass AND conname = 'brands_classification_status_check';

-- 2. Every value stored today, with counts. Expected: only pending, processing, complete, failed,
--    needs_confirmation. Any other value makes run2 fail (and must be looked at before running it).
SELECT classification_status, count(*) AS brands
FROM brands
GROUP BY classification_status
ORDER BY classification_status;

-- 3. Expected: 0 (the rows run2's CHECK would reject).
SELECT count(*) AS rows_outside_the_five
FROM brands
WHERE classification_status NOT IN ('pending', 'processing', 'complete', 'failed', 'needs_confirmation');
