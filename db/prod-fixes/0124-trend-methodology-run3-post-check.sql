-- 0124-trend-methodology-run3-post-check.sql (Vunnara, 6 Nov, "Mention
-- detection", part 6)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: one row -- nullable = YES, default =
-- NULL, app_role_* = t (the trend job writes it as the app role through
-- RLS; a service-role write needs no grant), rows_with_version = 0.
-- Run again after the push and the next trend job: rows_with_version > 0,
-- and rows_with_version_3 > 0 once a week has a v2.1 audit.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'visibility_trends' AND column_name = 'methodology_version') AS nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'visibility_trends' AND column_name = 'methodology_version') AS column_default,
  has_column_privilege('visibleau_app', 'visibility_trends', 'methodology_version', 'SELECT') AS app_role_select,
  has_column_privilege('visibleau_app', 'visibility_trends', 'methodology_version', 'INSERT') AS app_role_insert,
  has_column_privilege('visibleau_app', 'visibility_trends', 'methodology_version', 'UPDATE') AS app_role_update,
  (SELECT count(*) FROM visibility_trends WHERE methodology_version IS NOT NULL) AS rows_with_version,
  (SELECT count(*) FROM visibility_trends WHERE methodology_version = 3) AS rows_with_version_3;
