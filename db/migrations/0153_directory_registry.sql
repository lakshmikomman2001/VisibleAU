-- Migration 0153, directory registry (22 Nov 2026, S00 part 5; LLD 7.7, 8.8.3, appendix B, T6): every directory the
-- product recognises, in a table instead of a constant in code.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0153 run1 -> run3; run4 only to undo). The pushed code reads it
-- (lib/directories/registry-store.ts); if it can't, it uses the same rows from code (lib/directories/registry.ts
-- DIRECTORY_REGISTRY_SEED), so a missing table changes nothing anyone sees.
--
-- One row per domain pattern -- a host ("hipages.com.au") or a host and a path ("linkedin.com/company": a company
-- page, not a person's profile) -- grouped into one directory by directory_key, with its kind and which brands it
-- applies to: "trades" (the four trades types), "local" (every local business type) or "cited" (shown only when an
-- audit's answers cite it, so no brand's directory card or counts change unless they do).
--
-- Seeded with the list as it was in lib/directories/registry.ts (10 Australian directories, 7 US ones, all US
-- inactive) and appendix B's additions (the directories TechCore IT's audit #52 cited: Local Business Guide,
-- Directso, Whereis, LinkedIn, Nextdoor, Birdeye, Cylex; and Hotfrog, StartLocal, AussieWeb, Yelp AU, HealthEngine,
-- HotDoc), every one "cited". tests/unit/directories/registry-seed.test.ts holds these rows and the code's identical.
--
-- Global (no organization_id), so no RLS, like vertical_packs. Grants: visibleau_app gets the same as every other
-- table (prod-fix 0052 and its default privileges give DML on all of them; the app-role drift check in
-- tests/integration/global-setup.ts refuses less). The app only reads it. Idempotent: rows already there are kept.
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
