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

-- ==== Brand aliases (db/migrations/0153_brands_aliases.sql, S00 part 4) ====
-- brands.aliases (other names, '{}' for every existing brand, at most 10) and brands.name_suggestion (the wizard's
-- suggestion from the site; NULL for every existing brand). Additive; the pushed code selects both with every brand.
BEGIN;

ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "aliases" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "name_suggestion" TEXT;

DO $$ BEGIN
  ALTER TABLE "brands" ADD CONSTRAINT "brands_aliases_at_most_10" CHECK (cardinality("aliases") <= 10);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ==== Directory registry (db/migrations/0153_directory_registry.sql, S00 part 5) ====
-- Every directory the product recognises, one row per domain pattern, seeded with the code's list and appendix B.
-- Global (no workspace, no RLS); visibleau_app gets the grants every table has (prod-fix 0052).
BEGIN;

CREATE TABLE IF NOT EXISTS "directory_registry" (
  "domain_pattern"   TEXT PRIMARY KEY CHECK ("domain_pattern" ~ '^[a-z0-9.-]+\.[a-z]{2,}(/[a-z0-9/_-]+)?$'),
  "directory_key"    TEXT NOT NULL CHECK ("directory_key" ~ '^[a-z0-9_]+$'),
  "name"             TEXT NOT NULL CHECK (length(btrim("name")) BETWEEN 1 AND 60),
  "kind"             TEXT NOT NULL CHECK ("kind" IN ('trades', 'general', 'health', 'professional', 'reviews', 'social', 'maps')),
  "market"           TEXT NOT NULL DEFAULT 'au' CHECK ("market" IN ('au', 'us')),
  "applies_to"       TEXT NOT NULL CHECK ("applies_to" IN ('trades', 'local', 'cited')),
  "profile_url_hint" TEXT,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "sort_order"       INTEGER NOT NULL,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "directory_registry_key_idx" ON "directory_registry" ("directory_key");

INSERT INTO "directory_registry"
  ("domain_pattern", "directory_key", "name", "kind", "market", "applies_to", "profile_url_hint", "active", "sort_order")
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
ON CONFLICT ("domain_pattern") DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON "directory_registry" TO visibleau_app;

COMMIT;
