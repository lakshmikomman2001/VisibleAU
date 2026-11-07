-- 0127-failure-cost-unknown-run3-post-check.sql (Vunnara, 7 Nov, methodology
-- v2.2 part 4)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql (and run2b,
-- if Sri runs it). READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: query 1 one row -- cost_usd_nullable =
-- YES, the default 0, app_role_insert and app_role_select = t (the
-- runners insert failure rows as the app role, through prod-fix 0052's table
-- grants); unknown_cost_rows = 0, or run2b's count if it ran.
-- After the push, query 2 lists each engine's failures with an unknown cost:
-- timeouts, and calls whose model had no price. Counts only.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_usd') AS cost_usd_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_usd') AS cost_usd_default,
  has_column_privilege('visibleau_app', 'engine_call_failures', 'cost_usd', 'INSERT') AS app_role_insert,
  has_column_privilege('visibleau_app', 'engine_call_failures', 'cost_usd', 'SELECT') AS app_role_select,
  (SELECT count(*) FROM engine_call_failures WHERE cost_usd IS NULL) AS unknown_cost_rows;

SELECT
  f.engine,
  f.error_class,
  count(*) AS unknown_cost_failures,
  max(f.created_at) AT TIME ZONE 'Australia/Sydney' AS last_sydney
FROM engine_call_failures f
WHERE f.cost_usd IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;
