-- 0157-s04-run3-post-check.sql (27 Nov 2026, sprint S04 part 2): after run2. Every check must pass before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY (a read-only transaction, rolled back). Row-level security is checked from the catalogue (policies,
-- FORCE, grants), with no role switch: the production role can't SET ROLE visibleau_app (LLD amendment 80). Grants are
-- checked one privilege at a time (LLD amendment 92). 7 result tabs.

BEGIN READ ONLY;

-- 1. Both tables have RLS, FORCE RLS and four policies, each on app.current_org_id.
--    Expected: 2 rows (audit_reach_results, brand_visibility_scopes), each rls t, forced t, policies 4,
--    every_policy_uses_org t, commands {DELETE,INSERT,SELECT,UPDATE}.
SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies,
  (SELECT bool_and(coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%current_setting(''app.current_org_id''%')
     FROM pg_policies p WHERE p.tablename = c.relname) AS every_policy_uses_org,
  (SELECT array_agg(p.cmd ORDER BY p.cmd) FROM pg_policies p WHERE p.tablename = c.relname) AS commands
FROM pg_class c
WHERE c.oid IN ('public.brand_visibility_scopes'::regclass, 'public.audit_reach_results'::regclass)
ORDER BY c.relname;

-- 2. visibleau_app's grants, one privilege at a time; and that it doesn't bypass RLS.
--    Expected: 1 row: checked 8, missing 0, missing_list empty, app_bypasses_rls f.
WITH want(obj, priv) AS (VALUES
  ('brand_visibility_scopes', 'SELECT'), ('brand_visibility_scopes', 'INSERT'),
  ('brand_visibility_scopes', 'UPDATE'), ('brand_visibility_scopes', 'DELETE'),
  ('audit_reach_results', 'SELECT'), ('audit_reach_results', 'INSERT'),
  ('audit_reach_results', 'UPDATE'), ('audit_reach_results', 'DELETE')
), checked AS (
  SELECT obj, priv, has_table_privilege('visibleau_app', obj, priv) AS ok FROM want
)
SELECT count(*) AS checked,
  count(*) FILTER (WHERE NOT ok) AS missing,
  coalesce(string_agg(obj || ' ' || priv, ', ') FILTER (WHERE NOT ok), '') AS missing_list,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'visibleau_app') AS app_bypasses_rls
FROM checked;

-- 3. Every brand that isn't deleted has exactly one enabled reach, Local; no other reach exists yet.
--    Expected: 1 row: live_brands = run1's check 3, brands_not_local_only 0, other_reaches 0.
SELECT
  (SELECT count(*) FROM brands WHERE deleted_at IS NULL) AS live_brands,
  (SELECT count(*) FROM brands b WHERE b.deleted_at IS NULL AND (
     (SELECT count(*) FROM brand_visibility_scopes v WHERE v.brand_id = b.id AND v.enabled) <> 1
     OR NOT EXISTS (SELECT 1 FROM brand_visibility_scopes v
                    WHERE v.brand_id = b.id AND v.reach = 'local' AND v.enabled))) AS brands_not_local_only,
  (SELECT count(*) FROM brand_visibility_scopes WHERE reach <> 'local') AS other_reaches;

-- 4. Every complete audit has a local result equal to the headline it shows: the same answers and mentions, counted
--    again here as lib/scoring/resolve-audit-dimensions.ts counts them (Google only where "count in headline" was on).
--    Expected: 1 row: complete_audits = run1's check 3, without_result 0, not_equal 0, not_equal_list empty.
WITH headline AS (
  SELECT a.id,
    (SELECT count(*) FROM citations c
       WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE AND c.run_number = 1)
    + (SELECT count(*) FROM google_surface_results r JOIN audit_google_surfaces g ON g.audit_id = r.audit_id
       WHERE r.audit_id = a.id AND r.outcome = 'shown' AND r.is_branded_prompt = false
         AND (g.settings->>'countInHeadline')::boolean IS TRUE) AS n,
    (SELECT count(*) FROM citations c
       WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE AND c.run_number = 1
         AND c.brand_mentioned = true AND c.mention_verification IS DISTINCT FROM 'unverified')
    + (SELECT count(*) FROM google_surface_results r JOIN audit_google_surfaces g ON g.audit_id = r.audit_id
       WHERE r.audit_id = a.id AND r.outcome = 'shown' AND r.is_branded_prompt = false
         AND (g.settings->>'countInHeadline')::boolean IS TRUE
         AND r.brand_mentioned = true AND r.mention_verification IN ('verified_domain', 'verified_location')) AS m
  FROM audits a WHERE a.status = 'complete'
)
SELECT count(*) AS complete_audits,
  count(*) FILTER (WHERE r.audit_id IS NULL) AS without_result,
  count(*) FILTER (WHERE r.audit_id IS NOT NULL AND (r.everyday_answers <> h.n OR r.mentioned <> h.m)) AS not_equal,
  coalesce(string_agg(h.id::text, ', ')
    FILTER (WHERE r.audit_id IS NULL OR r.everyday_answers <> h.n OR r.mentioned <> h.m), '') AS not_equal_list
FROM headline h
LEFT JOIN audit_reach_results r ON r.audit_id = h.id AND r.reach = 'local';

-- 5. Each local result's hash is its audit's question_set_hash (the 'prompt_pack_version:' form for an audit without
--    one), and its interval is inside 0-1 around its rate.
--    Expected: 1 row: hash_differs 0, prompt_pack_version_hashes = run1's check 5, interval_off 0.
SELECT
  count(*) FILTER (WHERE r.reach_hash IS DISTINCT FROM
    coalesce(a.question_set_hash, 'prompt_pack_version:' || coalesce(a.prompt_pack_version, 1))) AS hash_differs,
  count(*) FILTER (WHERE r.reach_hash LIKE 'prompt_pack_version:%') AS prompt_pack_version_hashes,
  count(*) FILTER (WHERE r.everyday_answers > 0 AND NOT (
    r.ci_low >= 0 AND r.ci_high <= 1 AND r.ci_low <= r.mentioned::numeric / r.everyday_answers + 0.0001
    AND r.ci_high >= r.mentioned::numeric / r.everyday_answers - 0.0001)) AS interval_off
FROM audit_reach_results r JOIN audits a ON a.id = r.audit_id
WHERE r.reach = 'local';

-- 6. A brand's, an audit's or a workspace's delete takes its rows (ON DELETE CASCADE, 'c'); a user's delete only clears
--    updated_by (SET NULL, 'n').
--    Expected: 5 rows: audit_reach_results audits c, audit_reach_results organizations c, brand_visibility_scopes brands c,
--    brand_visibility_scopes organizations c, brand_visibility_scopes users n.
SELECT conrelid::regclass::text AS table_name, confrelid::regclass::text AS refers_to, confdeltype::text AS on_delete
FROM pg_constraint
WHERE conrelid IN ('public.brand_visibility_scopes'::regclass, 'public.audit_reach_results'::regclass)
  AND contype = 'f'
ORDER BY 1, 2;

-- 7. The CHECKs and the one-row-per-reach key are there.
--    Expected: 1 row: checks 5 (reach twice, target_count, everyday_answers, mentioned), brand_reach_key t.
SELECT
  (SELECT count(*) FROM pg_constraint
     WHERE conrelid IN ('public.brand_visibility_scopes'::regclass, 'public.audit_reach_results'::regclass)
       AND contype = 'c') AS checks,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_visibility_scopes_brand_reach_key') AS brand_reach_key;

ROLLBACK;
