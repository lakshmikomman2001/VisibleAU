-- 0153-s00-run4-rollback.sql (22 Nov, sprint S00): UNDO run2 -- only with the code from before this push deployed.
-- Sections in the reverse order of run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES. Sri runs it; NOT run from Claude Code.

-- ==== Brand aliases (db/migrations/0153_brands_aliases.sql, S00 part 4) ====
-- The two columns go (any aliases owners added, and the wizard's suggestions, with them: pg_dump brands first if
-- they should be kept). The old code never reads them.
BEGIN;

ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "brands_aliases_at_most_10";
ALTER TABLE "brands" DROP COLUMN IF EXISTS "name_suggestion";
ALTER TABLE "brands" DROP COLUMN IF EXISTS "aliases";

COMMIT;

-- ==== Flag keys (db/migrations/0153_feature_flag_keys.sql, S00 part 2) ====
-- Every flag goes back to off (its feature_settings rows deleted; with the old code nothing reads them), then the
-- six-key constraint returns. The Changes log rows (feature_setting_changes) and any workspace overrides
-- (org_feature_flags) are kept: they're history, and the old code ignores keys it doesn't know.
BEGIN;

DELETE FROM feature_settings
WHERE key IN ('report_v2', 'abn_suggestion', 'question_library', 'agency_questions', 'visibility_reach',
  'business_taxonomy', 'qi_website', 'qi_listings', 'qi_demand', 'qi_competitors', 'qi_pretest', 'qi_learning',
  'question_packs');

ALTER TABLE "feature_settings" DROP CONSTRAINT IF EXISTS "feature_settings_key_check";
ALTER TABLE "feature_settings" ADD CONSTRAINT "feature_settings_key_check" CHECK ("key" IN (
  'google_ai_overviews_enabled',
  'google_ai_mode_enabled',
  'google_surfaces_count_in_headline',
  'google_surfaces_queue_mode',
  'google_surfaces_device',
  'google_surfaces_max_cost_usd_per_audit'));

COMMIT;
