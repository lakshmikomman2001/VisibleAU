-- 0125-competitor-websites-run3-post-check.sql (Vunnara, 7 Nov, "Fair
-- competitor counting", Sri's decision 4)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: one row -- nullable = NO, column_default
-- = '{}'::jsonb, app_role_* = t (brand settings save it as the app role
-- through RLS), non_object_rows = 0, brands_with_websites = 0.
-- Run again after someone adds a competitor's website in brand settings:
-- brands_with_websites > 0, and keys_not_competitors stays 0 (the PATCH
-- route keeps the keys to the brand's competitors).
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'brands' AND column_name = 'competitor_websites') AS nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'brands' AND column_name = 'competitor_websites') AS column_default,
  has_column_privilege('visibleau_app', 'brands', 'competitor_websites', 'SELECT') AS app_role_select,
  has_column_privilege('visibleau_app', 'brands', 'competitor_websites', 'UPDATE') AS app_role_update,
  (SELECT count(*) FROM brands WHERE jsonb_typeof(competitor_websites) <> 'object') AS non_object_rows,
  (SELECT count(*) FROM brands WHERE competitor_websites <> '{}'::jsonb) AS brands_with_websites,
  (SELECT count(*)
   FROM brands b, jsonb_object_keys(b.competitor_websites) AS k
   WHERE NOT (k = ANY (b.competitors))) AS keys_not_competitors;
