-- 0154-s01-run1-precheck.sql (23 Nov 2026, sprint S01 part 2): migration 0154 (db/migrations/0154_report_v2.sql).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY. Sri runs it before run2; nothing is written.

-- 1. Nothing of 0154 exists yet. Expected: every column f (a rerun after run2 shows t, which is fine: run2 is
--    idempotent).
SELECT
  to_regclass('public.report_brand_preferences') IS NOT NULL AS report_brand_preferences_exists,
  to_regclass('public.report_action_choices') IS NOT NULL AS report_action_choices_exists,
  to_regclass('public.agency_actions') IS NOT NULL AS agency_actions_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'generated_reports' AND column_name = 'report_tier') AS generated_reports_report_tier,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'generated_reports' AND column_name = 'contents_snapshot') AS generated_reports_contents_snapshot,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_delivery_schedules' AND column_name = 'report_tier') AS schedules_report_tier,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agency_brand_assets' AND column_name = 'report_tier_names') AS report_tier_names,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'abn_suggestion') AS brands_abn_suggestion,
  to_regprocedure('public.report_tier_names_ok(jsonb)') IS NOT NULL AS report_tier_names_ok_exists;

-- 2. What run2 adds defaults to. Expected: the counts, for run3 to compare (every one of these rows becomes 'basic').
SELECT
  (SELECT count(*) FROM generated_reports) AS generated_reports,
  (SELECT count(*) FROM report_delivery_schedules) AS report_delivery_schedules,
  (SELECT count(*) FROM report_delivery_schedules WHERE is_active) AS active_schedules,
  (SELECT count(*) FROM agency_brand_assets WHERE brand_id IS NULL) AS workspace_branding_rows,
  (SELECT count(*) FROM agency_brand_assets WHERE brand_id IS NOT NULL) AS brand_branding_rows,
  (SELECT count(*) FROM brands) AS brands;

-- 3. The tables the new ones reference, and the role run2 grants to. Expected: every column t.
SELECT
  to_regclass('public.brands') IS NOT NULL AS brands,
  to_regclass('public.organizations') IS NOT NULL AS organizations,
  to_regclass('public.users') IS NOT NULL AS users,
  to_regclass('public.action_items') IS NOT NULL AS action_items,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app') AS visibleau_app_role;

-- 4. action_items.id is the uuid report_action_choices references. Expected: uuid.
SELECT data_type FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'id';
