-- 0153-s00-run3-post-check.sql (22 Nov, sprint S00): after run2. Every check must pass before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri runs it; NOT run from Claude Code. Nothing is kept: the one test write (check 2) is inside a transaction that
-- is rolled back at the end.

BEGIN;

-- ==== Flag keys (db/migrations/0153_feature_flag_keys.sql, S00 part 2) ====

-- 1. The constraint lists the six Google keys and the thirteen flags. Expected: keys_allowed = 19, every flag t.
SELECT
  (SELECT count(*) FROM regexp_matches(pg_get_constraintdef(oid), '''([a-z0-9_]+)''', 'g')) AS keys_allowed,
  pg_get_constraintdef(oid) LIKE '%''google_ai_mode_enabled''%' AS google_key_kept,
  pg_get_constraintdef(oid) LIKE '%''report_v2''%' AS report_v2,
  pg_get_constraintdef(oid) LIKE '%''question_packs''%' AS question_packs,
  pg_get_constraintdef(oid) LIKE '%''qi_learning''%' AS qi_learning
FROM pg_constraint
WHERE conrelid = 'feature_settings'::regclass AND conname = 'feature_settings_key_check';

-- 2. A flag key is accepted now, and a key that isn't one is still refused (the refusal is caught in a savepoint).
--    Expected: flag_key_accepted = t, then a NOTICE "unknown key refused: t". Both undone by the ROLLBACK below.
SAVEPOINT flag_key;
INSERT INTO feature_settings (key, value) VALUES ('report_v2', 'false'::jsonb);
SELECT EXISTS (SELECT 1 FROM feature_settings WHERE key = 'report_v2') AS flag_key_accepted;
ROLLBACK TO SAVEPOINT flag_key;
DO $$
BEGIN
  INSERT INTO feature_settings (key, value) VALUES ('not_a_flag', 'true'::jsonb);
  RAISE NOTICE 'unknown key refused: f (it was accepted)';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'unknown key refused: t';
END $$;

-- 3. Every flag is still off: no flag row, no flag override. Expected: 0 and 0.
SELECT
  (SELECT count(*) FROM feature_settings WHERE key IN ('report_v2', 'abn_suggestion', 'question_library',
    'agency_questions', 'visibility_reach', 'business_taxonomy', 'qi_website', 'qi_listings', 'qi_demand',
    'qi_competitors', 'qi_pretest', 'qi_learning', 'question_packs')) AS flag_rows,
  (SELECT count(*) FROM org_feature_flags WHERE flag_key IN ('report_v2', 'abn_suggestion', 'question_library',
    'agency_questions', 'visibility_reach', 'business_taxonomy', 'qi_website', 'qi_listings', 'qi_demand',
    'qi_competitors', 'qi_pretest', 'qi_learning', 'question_packs')) AS flag_overrides;

-- 4. The app role's grants on what the flags read and write (unchanged by run2). Expected: every column t.
SELECT
  has_table_privilege('visibleau_app', 'feature_settings', 'SELECT,INSERT,UPDATE,DELETE') AS app_feature_settings,
  has_table_privilege('visibleau_app', 'feature_setting_changes', 'SELECT,INSERT') AS app_feature_setting_changes,
  has_table_privilege('visibleau_app', 'org_feature_flags', 'SELECT,INSERT,UPDATE,DELETE') AS app_org_feature_flags,
  has_table_privilege('visibleau_app', 'audit_trail', 'INSERT') AS app_audit_trail;

-- ==== Brand aliases (db/migrations/0153_brands_aliases.sql, S00 part 4) ====

-- 5. Both columns, with their defaults. Expected: aliases ARRAY '{}'::text[] NO; name_suggestion text (null) YES.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'brands' AND column_name IN ('aliases', 'name_suggestion')
ORDER BY column_name;

-- 6. Every existing brand has no alias and no suggestion. Expected: with_aliases = 0, with_suggestion = 0.
SELECT
  count(*) FILTER (WHERE cardinality(aliases) > 0) AS with_aliases,
  count(*) FILTER (WHERE name_suggestion IS NOT NULL) AS with_suggestion
FROM brands;

-- 7. The CHECK holds the count. Expected: one row, brands_aliases_at_most_10.
SELECT conname FROM pg_constraint WHERE conrelid = 'brands'::regclass AND conname = 'brands_aliases_at_most_10';

-- 8. The app role reads and writes the new columns. Expected: t, t, t, t.
SELECT
  has_column_privilege('visibleau_app', 'brands', 'aliases', 'SELECT') AS app_reads_aliases,
  has_column_privilege('visibleau_app', 'brands', 'aliases', 'UPDATE') AS app_writes_aliases,
  has_column_privilege('visibleau_app', 'brands', 'name_suggestion', 'SELECT') AS app_reads_suggestion,
  has_column_privilege('visibleau_app', 'brands', 'name_suggestion', 'INSERT') AS app_writes_suggestion;

ROLLBACK;
