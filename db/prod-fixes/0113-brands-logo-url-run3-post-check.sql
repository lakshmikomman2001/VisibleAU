-- 0113-brands-logo-url-run3-post-check.sql (Vunnara, 2 Nov, "Upload
-- instead does nothing in Brand basics", part 2)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql
-- finishes. READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row -- column_present = t, is_nullable = YES,
-- column_default = NULL, app_role_can_select = t, app_role_can_insert = t,
-- app_role_can_update = t (the app writes it on brand creation as the app
-- role), and all_rows_null = t (no logo uploaded under the new code yet).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'logo_url'
  ) AS column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'brands' AND column_name = 'logo_url') AS is_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'brands' AND column_name = 'logo_url') AS column_default,
  has_column_privilege('visibleau_app', 'brands', 'logo_url', 'SELECT') AS app_role_can_select,
  has_column_privilege('visibleau_app', 'brands', 'logo_url', 'INSERT') AS app_role_can_insert,
  has_column_privilege('visibleau_app', 'brands', 'logo_url', 'UPDATE') AS app_role_can_update,
  (SELECT count(*) = count(*) FILTER (WHERE logo_url IS NULL) FROM brands) AS all_rows_null;
