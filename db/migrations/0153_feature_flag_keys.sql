-- Migration 0153, flag keys (22 Nov 2026, S00 part 2; LLD section 17): the client-enhancements feature flags keep
-- their global value in feature_settings, the store /admin/settings already uses for Google AI.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0153 run1 -> run3; run4 only to undo). The pushed code reads these
-- keys (lib/flags/flags.ts); a read that fails counts as "off", so a missing migration can't turn anything on, but
-- an operator's save on /admin/settings would be refused by the old CHECK.
--
-- feature_settings.key has a CHECK listing the six Google keys (0145). This replaces it with one listing those six
-- and the thirteen flag names (lib/flags/flags.ts FLAG_NAMES). Nothing else changes: no row is written (a missing row
-- is "off", so every flag starts off), no column, policy or grant. The workspace override is org_feature_flags (a
-- free-text flag_key, FORCE RLS since 0029) and the history is feature_setting_changes (free-text setting_key):
-- both take the new keys as they are.
--
-- Idempotent: dropping and adding the constraint again gives the same result. Every existing row has one of the six
-- old keys, so the new CHECK validates at once.
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
