-- 0148-audits-excluded-from-trends-run3-post-check.sql (14 Nov, part 5): after run2, before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY. Sri runs it; NOT run from Claude Code.

-- 1. Expected: one row, data_type = text, is_nullable = YES, column_default NULL.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audits' AND column_name = 'excluded_from_trends_reason';

-- 2. Expected: 0 (nothing is excluded until an operator does it on /admin/audits after the push).
SELECT count(*) AS excluded_audits FROM audits WHERE excluded_from_trends_reason IS NOT NULL;

-- 3. RLS is unchanged, and the app role reaches the new column through its existing table grants (prod-fix 0052).
--    Expected: rls_enabled = t, app_can_select = t, app_can_update = t.
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.audits'::regclass) AS rls_enabled,
  has_column_privilege('visibleau_app', 'public.audits', 'excluded_from_trends_reason', 'SELECT') AS app_can_select,
  has_column_privilege('visibleau_app', 'public.audits', 'excluded_from_trends_reason', 'UPDATE') AS app_can_update;
