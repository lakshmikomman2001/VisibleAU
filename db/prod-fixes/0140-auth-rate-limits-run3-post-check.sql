-- 0140-auth-rate-limits-run3-post-check.sql (live invite test follow-ups, part 5).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY: one SELECT. Counts only -- no keys
-- (a key is a caller's address and a route). Sri runs it; NOT run from Claude Code. Run after run2, and again
-- after the push.
--
-- Expected result: one row --
--   table_exists = t, columns_as_expected = 4, key_unique = t, app_role_can_write = t
--   rows: 0 before the push; after it, one per caller and route that signed in, signed up or asked for a
--   reset or a verification email (better-auth updates a row in place; it never deletes one)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'auth_rate_limits'
  ) AS table_exists,
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'auth_rate_limits'
     AND (column_name, data_type) IN (('id', 'text'), ('key', 'text'), ('count', 'integer'), ('last_request', 'bigint'))
  ) AS columns_as_expected,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.auth_rate_limits'::regclass AND conname = 'auth_rate_limits_key_unique'
      AND contype = 'u'
  ) AS key_unique,
  has_table_privilege('visibleau_app', 'public.auth_rate_limits', 'SELECT, INSERT, UPDATE, DELETE')
    AS app_role_can_write,
  (SELECT count(*) FROM auth_rate_limits) AS rows;
