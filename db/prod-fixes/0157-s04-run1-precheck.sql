-- 0157-s04-run1-precheck.sql (27 Nov 2026, sprint S04 part 2): migration 0157 (db/migrations/0157_visibility_reach.sql),
-- visibility reach: brand_visibility_scopes and audit_reach_results, and run2's backfill of a local reach per brand and a
-- local result per past complete audit.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY. Sri runs it before run2; nothing is written. 6 result tabs (Neon's editor shows at most 25).

-- 1. Nothing of 0157 exists yet.
--    Expected: scopes_table f, results_table f. (A rerun after run2 shows t, t: fine.)
SELECT
  to_regclass('public.brand_visibility_scopes') IS NOT NULL AS scopes_table,
  to_regclass('public.audit_reach_results') IS NOT NULL AS results_table;

-- 2. What run2 needs: the role may create tables in public, owns the tables the new ones reference, and the app role
--    exists. Expected: can_create t, owns_brands t, owns_audits t, app_role_exists t.
SELECT
  has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
  pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = 'public.brands'::regclass), 'USAGE')
    AS owns_brands,
  pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = 'public.audits'::regclass), 'USAGE')
    AS owns_audits,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app') AS app_role_exists;

-- 3. What the backfill writes, counted now (keep these for run2's summary and run3's check 6).
--    Expected: live_brands = the brands run2 gives a local reach (S03's run1 counted 5, the free sample's included);
--    brands_with_a_set + brands_without_a_set = live_brands (a brand with no set yet gets target_count 10, the default);
--    complete_audits = the local results run2 writes.
SELECT
  (SELECT count(*) FROM brands WHERE deleted_at IS NULL) AS live_brands,
  (SELECT count(*) FROM brands b WHERE b.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM brand_question_sets s WHERE s.brand_id = b.id AND s.is_current)) AS brands_with_a_set,
  (SELECT count(*) FROM brands b WHERE b.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM brand_question_sets s WHERE s.brand_id = b.id AND s.is_current))
    AS brands_without_a_set,
  (SELECT count(*) FROM audits WHERE status = 'complete') AS complete_audits;

-- 4. The local reach's values: the place comes from the brand's own suburb, city, state and postcode; target_count is
--    its current set's everyday count, which must fit the column's 0-60.
--    Expected: brands_with_no_place = the brands with no location yet (they get place {}), over_60 0.
SELECT
  (SELECT count(*) FROM brands WHERE deleted_at IS NULL
     AND coalesce(nullif(trim(suburb), ''), nullif(trim(city), ''), nullif(trim(state), ''), nullif(trim(postcode), ''))
       IS NULL) AS brands_with_no_place,
  (SELECT count(*) FROM (
     SELECT s.brand_id FROM brand_question_sets s JOIN brand_question_set_items i ON i.set_id = s.id
     WHERE s.is_current AND i.kind = 'everyday' GROUP BY s.brand_id HAVING count(*) > 60) x) AS over_60;

-- 5. The local result's hash is the audit's question_set_hash; an audit without one (before 0150) gets
--    'prompt_pack_version:' || its version, so such audits compare as they do today (lib/audit/question-set.ts).
--    Expected: complete_without_hash = how many there are (run3's check 5 counts the same).
SELECT count(*) AS complete_without_hash FROM audits WHERE status = 'complete' AND question_set_hash IS NULL;

-- 6. Nothing else uses the names run2 adds. Expected: 0 rows.
SELECT conname AS name, conrelid::regclass::text AS on_table
FROM pg_constraint
WHERE conname IN ('brand_visibility_scopes_pkey', 'brand_visibility_scopes_brand_reach_key', 'audit_reach_results_pkey')
UNION ALL
SELECT policyname, tablename::text FROM pg_policies
WHERE tablename IN ('brand_visibility_scopes', 'audit_reach_results');
