-- 0153-s00-run1-precheck.sql (22 Nov, sprint S00): before migration 0153. Mirrors db/migrations/0153_*.sql, one
-- section per file (flag keys, S00 part 2; later sections are added by the parts that write them).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, inside a READ ONLY transaction that is rolled back. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. run4 only to undo run2, with the code from before this push
-- deployed.

BEGIN TRANSACTION READ ONLY;

-- ==== Flag keys (db/migrations/0153_feature_flag_keys.sql, S00 part 2) ====

-- 1. The constraint run2 replaces. Expected: one row, feature_settings_key_check, listing exactly the six Google keys
--    (google_ai_overviews_enabled, google_ai_mode_enabled, google_surfaces_count_in_headline,
--    google_surfaces_queue_mode, google_surfaces_device, google_surfaces_max_cost_usd_per_audit).
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'feature_settings'::regclass AND contype = 'c';

-- 2. What's stored now. Expected: only Google keys (0 to 6 rows); flag_rows = 0, so every flag starts off.
SELECT key, value, updated_at FROM feature_settings ORDER BY key;
SELECT count(*) AS flag_rows
FROM feature_settings
WHERE key IN ('report_v2', 'abn_suggestion', 'question_library', 'agency_questions', 'visibility_reach',
  'business_taxonomy', 'qi_website', 'qi_listings', 'qi_demand', 'qi_competitors', 'qi_pretest', 'qi_learning',
  'question_packs');

-- 3. No workspace override uses a flag's name yet (org_feature_flags' keys are free text). Expected: 0.
SELECT count(*) AS flag_overrides
FROM org_feature_flags
WHERE flag_key IN ('report_v2', 'abn_suggestion', 'question_library', 'agency_questions', 'visibility_reach',
  'business_taxonomy', 'qi_website', 'qi_listings', 'qi_demand', 'qi_competitors', 'qi_pretest', 'qi_learning',
  'question_packs');

-- 4. The app role can already read and write the three tables the flags use (prod-fix 0052), and the runner owns
--    feature_settings (run2 alters its constraint). Expected: every column t.
SELECT
  has_table_privilege('visibleau_app', 'feature_settings', 'SELECT,INSERT,UPDATE,DELETE') AS app_feature_settings,
  has_table_privilege('visibleau_app', 'feature_setting_changes', 'SELECT,INSERT') AS app_feature_setting_changes,
  has_table_privilege('visibleau_app', 'org_feature_flags', 'SELECT,INSERT,UPDATE,DELETE') AS app_org_feature_flags,
  has_table_privilege('visibleau_app', 'audit_trail', 'INSERT') AS app_audit_trail,
  pg_has_role(current_user, (SELECT tableowner FROM pg_tables WHERE tablename = 'feature_settings'), 'USAGE')
    AS runner_owns_feature_settings;

-- ==== Brand aliases (db/migrations/0153_brands_aliases.sql, S00 part 4) ====

-- 5. The two columns don't exist yet. Expected: 0 rows (or both, if run2 already ran).
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'brands' AND column_name IN ('aliases', 'name_suggestion');

-- 6. How many brands get the defaults (aliases '{}', name_suggestion NULL). Expected: every brand.
SELECT count(*) AS brands, count(*) FILTER (WHERE deleted_at IS NULL) AS live_brands FROM brands;

-- 7. The app role can already write brands' new columns once they exist (prod-fix 0052 grants table-wide DML).
--    Expected: t.
SELECT has_table_privilege('visibleau_app', 'brands', 'SELECT,INSERT,UPDATE') AS app_brands;

ROLLBACK;
