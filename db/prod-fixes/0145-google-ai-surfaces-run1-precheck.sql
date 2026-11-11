-- 0145-google-ai-surfaces-run1-precheck.sql (Google AI surfaces, Phase 1, part 1): before the tables for the
-- Google AI Overviews / AI Mode switches and results exist. Mirrors db/migrations/0145_google_ai_surfaces.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed code's schema names these tables (Drizzle),
-- and the admin page and the audit's Google step read them; with the env switch GOOGLE_AI_SURFACES_ENABLED
-- off (the default) no audit reads them, but /admin/settings does. run4 only to undo run2, with the code
-- from before this push deployed, and only while the tables are empty.
--
-- No backup step: nothing existing changes. Five new tables; no existing table, column, constraint, index,
-- policy or grant is touched, so there's nothing to copy aside and no run "drop-backup".

-- 1. Expected: all five f (t for any that run2 already created).
SELECT
  to_regclass('public.feature_settings') IS NOT NULL         AS feature_settings_exists,
  to_regclass('public.feature_setting_changes') IS NOT NULL  AS feature_setting_changes_exists,
  to_regclass('public.brand_google_locations') IS NOT NULL   AS brand_google_locations_exists,
  to_regclass('public.audit_google_surfaces') IS NOT NULL    AS audit_google_surfaces_exists,
  to_regclass('public.google_surface_results') IS NOT NULL   AS google_surface_results_exists;

-- 2. Expected: t -- the role the app connects as exists (run2 grants to it).
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app') AS app_role_exists;

-- 3. Context, unchanged by this fix: the per-workspace flag rows for the two Google keys. Expected: 0 rows
--    (nothing has ever written either key; google_ai_mode_enabled is canonical since sprint 8, never set).
SELECT organization_id, flag_key, is_enabled, expires_at
FROM org_feature_flags
WHERE flag_key IN ('google_ai_overviews_enabled', 'google_ai_mode_enabled');

-- 4. Context: the old, unused google_ai_mode_results table stays as it is (not dropped here). Expected: 0.
SELECT count(*) AS google_ai_mode_results_rows FROM google_ai_mode_results;
