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

-- ==== Directory registry (db/migrations/0153_directory_registry.sql, S00 part 5) ====

-- 8. The table doesn't exist yet. Expected: f (t if run2 already ran).
SELECT to_regclass('public.directory_registry') IS NOT NULL AS table_exists;

-- 9. The rows run2 seeds: the list as it is in the code today (applies_to trades or local; the 7 US ones inactive)
--    and appendix B's additions (applies_to cited: shown only when an audit cites them). Expected: 35 rows, 30
--    directories; 20 rows (17 directories) were_in_the_list; 13 directories (15 rows) new.
WITH seed (domain_pattern, directory_key, name, kind, market, applies_to, profile_url_hint, active, sort_order) AS (
  VALUES
  ('hipages.com.au', 'hipages', 'hipages', 'trades', 'au', 'trades', 'hipages.com.au/connect/{slug}', true, 10),
  ('serviceseeking.com.au', 'serviceseeking', 'ServiceSeeking', 'trades', 'au', 'trades', NULL, true, 20),
  ('oneflare.com.au', 'oneflare', 'Oneflare', 'trades', 'au', 'trades', NULL, true, 30),
  ('airtasker.com', 'airtasker', 'Airtasker', 'trades', 'au', 'trades', NULL, true, 40),
  ('yellowpages.com.au', 'yellow_pages_au', 'Yellow Pages', 'general', 'au', 'local', NULL, true, 50),
  ('truelocal.com.au', 'true_local', 'True Local', 'general', 'au', 'local', NULL, true, 60),
  ('localsearch.com.au', 'localsearch', 'Localsearch', 'general', 'au', 'local', NULL, true, 70),
  ('productreview.com.au', 'product_review', 'ProductReview', 'reviews', 'au', 'local', NULL, true, 80),
  ('wordofmouth.com.au', 'word_of_mouth', 'Word of Mouth', 'general', 'au', 'local', NULL, true, 90),
  ('womo.com.au', 'word_of_mouth', 'Word of Mouth', 'general', 'au', 'local', NULL, true, 91),
  ('google.com', 'google_business_profile', 'Google Business Profile', 'maps', 'au', 'local', NULL, true, 100),
  ('business.google.com', 'google_business_profile', 'Google Business Profile', 'maps', 'au', 'local', NULL, true, 101),
  ('g.page', 'google_business_profile', 'Google Business Profile', 'maps', 'au', 'local', NULL, true, 102),
  ('localbusinessguide.com.au', 'local_business_guide', 'Local Business Guide', 'general', 'au', 'cited', NULL, true, 200),
  ('directso.com.au', 'directso', 'Directso', 'general', 'au', 'cited', NULL, true, 210),
  ('whereis.com', 'whereis', 'Whereis', 'maps', 'au', 'cited', NULL, true, 220),
  ('cylex-australia.com', 'cylex', 'Cylex', 'general', 'au', 'cited', NULL, true, 230),
  ('au.nextdoor.com', 'nextdoor_au', 'Nextdoor', 'social', 'au', 'cited', NULL, true, 240),
  ('reviews.birdeye.com', 'birdeye', 'Birdeye', 'reviews', 'au', 'cited', NULL, true, 250),
  ('birdeye.com', 'birdeye', 'Birdeye', 'reviews', 'au', 'cited', NULL, true, 251),
  ('linkedin.com/company', 'linkedin', 'LinkedIn', 'professional', 'au', 'cited', NULL, true, 260),
  ('au.linkedin.com/company', 'linkedin', 'LinkedIn', 'professional', 'au', 'cited', NULL, true, 261),
  ('hotfrog.com.au', 'hotfrog', 'Hotfrog', 'general', 'au', 'cited', NULL, true, 270),
  ('startlocal.com.au', 'startlocal', 'StartLocal', 'general', 'au', 'cited', NULL, true, 280),
  ('aussieweb.com.au', 'aussieweb', 'AussieWeb', 'general', 'au', 'cited', NULL, true, 290),
  ('yelp.com.au', 'yelp_au', 'Yelp', 'reviews', 'au', 'cited', NULL, true, 300),
  ('healthengine.com.au', 'healthengine', 'HealthEngine', 'health', 'au', 'cited', NULL, true, 310),
  ('hotdoc.com.au', 'hotdoc', 'HotDoc', 'health', 'au', 'cited', NULL, true, 320),
  ('yelp.com', 'yelp', 'Yelp', 'reviews', 'us', 'local', NULL, false, 1010),
  ('angi.com', 'angi', 'Angi', 'trades', 'us', 'trades', NULL, false, 1020),
  ('thumbtack.com', 'thumbtack', 'Thumbtack', 'trades', 'us', 'trades', NULL, false, 1030),
  ('homeadvisor.com', 'homeadvisor', 'HomeAdvisor', 'trades', 'us', 'trades', NULL, false, 1040),
  ('bbb.org', 'bbb', 'Better Business Bureau', 'reviews', 'us', 'local', NULL, false, 1050),
  ('nextdoor.com', 'nextdoor', 'Nextdoor', 'social', 'us', 'local', NULL, false, 1060),
  ('houzz.com', 'houzz', 'Houzz', 'trades', 'us', 'trades', NULL, false, 1070)
)
SELECT directory_key, name, kind, market, applies_to, active,
       string_agg(domain_pattern, ', ' ORDER BY sort_order) AS patterns,
       applies_to <> 'cited' AS were_in_the_list
FROM seed
GROUP BY directory_key, name, kind, market, applies_to, active
ORDER BY min(sort_order);

ROLLBACK;
