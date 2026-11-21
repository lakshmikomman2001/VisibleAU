-- 0153-s00-run2-apply.sql (22 Nov, sprint S00): migration 0153. The same statements as db/migrations/0153_*.sql, one
-- section per file, each in its own transaction.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES. Sri runs it after run1, BEFORE the push. Take a pg_dump of feature_settings first (CLAUDE.md: production
-- changes need a backup).

-- ==== Flag keys (db/migrations/0153_feature_flag_keys.sql, S00 part 2) ====
-- feature_settings' CHECK lists the six Google keys and the thirteen feature flags. No row is written: a missing row
-- is "off", so every flag starts off. Nothing else changes.
BEGIN;

ALTER TABLE "feature_settings" DROP CONSTRAINT IF EXISTS "feature_settings_key_check";
ALTER TABLE "feature_settings" ADD CONSTRAINT "feature_settings_key_check" CHECK ("key" IN (
  'google_ai_overviews_enabled',
  'google_ai_mode_enabled',
  'google_surfaces_count_in_headline',
  'google_surfaces_queue_mode',
  'google_surfaces_device',
  'google_surfaces_max_cost_usd_per_audit',
  'report_v2',
  'abn_suggestion',
  'question_library',
  'agency_questions',
  'visibility_reach',
  'business_taxonomy',
  'qi_website',
  'qi_listings',
  'qi_demand',
  'qi_competitors',
  'qi_pretest',
  'qi_learning',
  'question_packs'));

COMMIT;
