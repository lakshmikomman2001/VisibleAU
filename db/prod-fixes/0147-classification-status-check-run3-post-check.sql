-- 0147-classification-status-check-run3-post-check.sql (14 Nov): after run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY. Sri runs it; NOT run from Claude Code.

-- 1. Expected: one row, CHECK ((classification_status = ANY (ARRAY['pending'::text, 'processing'::text,
--    'complete'::text, 'failed'::text, 'needs_confirmation'::text]))).
SELECT conname, pg_get_constraintdef(oid) AS definition, convalidated
FROM pg_constraint
WHERE conrelid = 'public.brands'::regclass AND conname = 'brands_classification_status_check';

-- 2. Expected: the same counts as run1's query 2 (nothing changed in the data).
SELECT classification_status, count(*) AS brands
FROM brands
GROUP BY classification_status
ORDER BY classification_status;

-- 3. RLS and the app role, unchanged. Expected: rls_enabled = t, app_can_update = t.
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.brands'::regclass) AS rls_enabled,
  has_table_privilege('visibleau_app', 'public.brands', 'UPDATE') AS app_can_update;
