-- 0145-google-ai-surfaces-run3-post-check.sql (Google AI surfaces, Phase 1, part 1): after run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY. Sri runs it; NOT run from Claude Code.
-- Every row should read PASS. Any FAIL: don't push; send me the output.

WITH checks AS (
  SELECT 'the five tables exist' AS check_name, 'true' AS expected,
    (to_regclass('public.feature_settings') IS NOT NULL
     AND to_regclass('public.feature_setting_changes') IS NOT NULL
     AND to_regclass('public.brand_google_locations') IS NOT NULL
     AND to_regclass('public.audit_google_surfaces') IS NOT NULL
     AND to_regclass('public.google_surface_results') IS NOT NULL)::text AS actual
  UNION ALL
  SELECT 'workspace tables: RLS enabled and forced', 'true',
    (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class
       WHERE relname IN ('brand_google_locations', 'audit_google_surfaces', 'google_surface_results'))::text
  UNION ALL
  SELECT 'workspace tables: 12 policies, each on app.current_org_id', '12',
    (SELECT count(*) FROM pg_policies
       WHERE tablename IN ('brand_google_locations', 'audit_google_surfaces', 'google_surface_results')
         AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%app.current_org_id%')::text
  UNION ALL
  SELECT 'global tables have no RLS (operator-only, no workspace column)', 'false',
    (SELECT bool_or(relrowsecurity) FROM pg_class
       WHERE relname IN ('feature_settings', 'feature_setting_changes'))::text
  UNION ALL
  SELECT 'visibleau_app: SELECT/INSERT/UPDATE/DELETE on all five', '20',
    (SELECT count(*) FROM information_schema.role_table_grants
       WHERE grantee = 'visibleau_app'
         AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
         AND table_name IN ('feature_settings', 'feature_setting_changes', 'brand_google_locations',
                            'audit_google_surfaces', 'google_surface_results'))::text
  UNION ALL
  SELECT 'one result row per audit, surface and question (unique index)', 'true',
    (to_regclass('public.google_surface_results_audit_surface_prompt_idx') IS NOT NULL)::text
  UNION ALL
  SELECT 'results go with their audit (ON DELETE CASCADE)', 'c',
    (SELECT confdeltype::text FROM pg_constraint
       WHERE conrelid = 'public.google_surface_results'::regclass AND contype = 'f'
         AND confrelid = 'public.audits'::regclass)
  UNION ALL
  SELECT 'no setting, override, postcode or result yet', '0',
    ((SELECT count(*) FROM feature_settings) + (SELECT count(*) FROM feature_setting_changes)
     + (SELECT count(*) FROM brand_google_locations) + (SELECT count(*) FROM audit_google_surfaces)
     + (SELECT count(*) FROM google_surface_results))::text
  UNION ALL
  SELECT 'audits unchanged: no column named google_*', '0',
    (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'audits' AND column_name LIKE 'google%')::text
)
SELECT check_name, expected, actual, CASE WHEN expected = actual THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks;
