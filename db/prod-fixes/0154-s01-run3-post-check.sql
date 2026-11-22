-- 0154-s01-run3-post-check.sql (23 Nov 2026, sprint S01 part 2): after run2. Every check must pass before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri runs it; NOT run from Claude Code. Nothing is kept: the test writes (checks 7-9) are inside a transaction that
-- is rolled back at the end.

BEGIN;

-- 1. The three tables exist with FORCE RLS, and four policies each on app.current_org_id.
--    Expected: 3 rows, rls t, forced t, policies 4, every policy_uses_org t.
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies,
  (SELECT bool_and(coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%app.current_org_id%')
     FROM pg_policies p WHERE p.tablename = c.relname) AS policy_uses_org
FROM pg_class c
WHERE c.relname IN ('report_brand_preferences', 'report_action_choices', 'agency_actions') AND c.relkind = 'r'
ORDER BY c.relname;

-- 2. visibleau_app's grants. Expected: every column t.
SELECT
  has_table_privilege('visibleau_app', 'report_brand_preferences', 'SELECT,INSERT,UPDATE,DELETE') AS prefs_dml,
  has_table_privilege('visibleau_app', 'report_action_choices', 'SELECT,INSERT,UPDATE,DELETE') AS choices_dml,
  has_table_privilege('visibleau_app', 'agency_actions', 'SELECT,INSERT,UPDATE,DELETE') AS agency_actions_dml,
  has_column_privilege('visibleau_app', 'generated_reports', 'report_tier', 'SELECT,INSERT,UPDATE') AS report_tier_col,
  has_column_privilege('visibleau_app', 'generated_reports', 'contents_snapshot', 'SELECT,INSERT,UPDATE') AS snapshot_col,
  has_column_privilege('visibleau_app', 'report_delivery_schedules', 'report_tier', 'SELECT,INSERT,UPDATE') AS schedule_tier_col,
  has_column_privilege('visibleau_app', 'agency_brand_assets', 'report_tier_names', 'SELECT,INSERT,UPDATE') AS tier_names_col,
  has_column_privilege('visibleau_app', 'brands', 'abn_suggestion', 'SELECT,INSERT,UPDATE') AS abn_suggestion_col,
  has_function_privilege('visibleau_app', 'report_tier_names_ok(jsonb)', 'EXECUTE') AS tier_names_check_fn;

-- 3. Every existing report and schedule is 'basic' (today's report, N15), and no report has a snapshot yet.
--    Expected: not_basic_reports 0, not_basic_schedules 0, reports_with_snapshot 0; the totals equal run1's check 2.
SELECT
  (SELECT count(*) FROM generated_reports) AS generated_reports,
  (SELECT count(*) FROM generated_reports WHERE report_tier <> 'basic') AS not_basic_reports,
  (SELECT count(*) FROM generated_reports WHERE contents_snapshot IS NOT NULL) AS reports_with_snapshot,
  (SELECT count(*) FROM report_delivery_schedules) AS report_delivery_schedules,
  (SELECT count(*) FROM report_delivery_schedules WHERE report_tier <> 'basic') AS not_basic_schedules;

-- 4. No branding row has tier names, and no brand an ABN suggestion. Expected: 0 and 0.
SELECT
  (SELECT count(*) FROM agency_brand_assets WHERE report_tier_names IS NOT NULL) AS rows_with_tier_names,
  (SELECT count(*) FROM brands WHERE abn_suggestion IS NOT NULL) AS brands_with_abn_suggestion;

-- 5. The new tables are empty. Expected: 0, 0, 0.
SELECT
  (SELECT count(*) FROM report_brand_preferences) AS prefs,
  (SELECT count(*) FROM report_action_choices) AS choices,
  (SELECT count(*) FROM agency_actions) AS agency_actions;

-- 6. Column defaults. Expected: 'basic'::text twice.
SELECT table_name, column_default FROM information_schema.columns
WHERE column_name = 'report_tier' AND table_name IN ('generated_reports', 'report_delivery_schedules')
ORDER BY table_name;

-- 7. The tier-name rules (the function behind the CHECK). Expected: t, t, f, f, f, f, f.
SELECT
  report_tier_names_ok('{"basic":"Essentials","standard":"Growth Plan","enhanced":"Premium Audit"}') AS three_names,
  report_tier_names_ok('{"enhanced":"Premium Audit"}') AS one_name,
  report_tier_names_ok('{"basic":"Essentials","standard":"essentials"}') AS same_ignoring_case,
  report_tier_names_ok('{"basic":"   "}') AS blank,
  report_tier_names_ok('{"basic":"A name that is far too long for a cover"}') AS over_24,
  report_tier_names_ok(jsonb_build_object('basic', 'Two' || chr(10) || 'lines')) AS line_break,
  report_tier_names_ok('{"premium":"Premium"}') AS unknown_key;

-- 8. The tier CHECK refuses an unknown tier (caught in a savepoint). Expected: NOTICE "unknown tier refused: t".
SAVEPOINT tier_check;
DO $$
BEGIN
  UPDATE generated_reports SET report_tier = 'platinum' WHERE id = (SELECT id FROM generated_reports LIMIT 1);
  IF FOUND THEN RAISE NOTICE 'unknown tier refused: f (it was accepted)';
  ELSE RAISE NOTICE 'unknown tier refused: (no report to try)'; END IF;
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'unknown tier refused: t';
END $$;
ROLLBACK TO SAVEPOINT tier_check;

-- 9. Tier names only on a workspace row (brand_id IS NULL). Expected: NOTICE "brand row refused: t" (or "no brand
--    row to try").
SAVEPOINT workspace_only;
DO $$
BEGIN
  UPDATE agency_brand_assets SET report_tier_names = '{"basic":"Essentials"}'
  WHERE id = (SELECT id FROM agency_brand_assets WHERE brand_id IS NOT NULL LIMIT 1);
  IF FOUND THEN RAISE NOTICE 'brand row refused: f (it was accepted)';
  ELSE RAISE NOTICE 'brand row refused: (no brand row to try)'; END IF;
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'brand row refused: t';
END $$;
ROLLBACK TO SAVEPOINT workspace_only;

ROLLBACK;
