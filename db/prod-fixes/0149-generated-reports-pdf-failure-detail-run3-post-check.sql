-- 0149-generated-reports-pdf-failure-detail-run3-post-check.sql (14 Nov, part 6): after run2, before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY. Sri runs it; NOT run from Claude Code.

-- 1. Expected: one row, data_type = text, is_nullable = YES, column_default NULL.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'generated_reports' AND column_name = 'pdf_failure_detail';

-- 2. Expected: 0 (only failures after the push record a detail; earlier ones keep their category alone).
SELECT count(*) AS reports_with_detail FROM generated_reports WHERE pdf_failure_detail IS NOT NULL;

-- 3. RLS is unchanged, and the app role reaches the new column through its existing table grants (prod-fix 0052).
--    Expected: rls_enabled = t, app_can_select = t, app_can_update = t.
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.generated_reports'::regclass) AS rls_enabled,
  has_column_privilege('visibleau_app', 'public.generated_reports', 'pdf_failure_detail', 'SELECT') AS app_can_select,
  has_column_privilege('visibleau_app', 'public.generated_reports', 'pdf_failure_detail', 'UPDATE') AS app_can_update;
