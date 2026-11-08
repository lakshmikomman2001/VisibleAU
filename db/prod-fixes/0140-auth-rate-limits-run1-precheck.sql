-- 0140-auth-rate-limits-run1-precheck.sql (live invite test follow-ups, part 5): before better-auth keeps its
-- rate limits in Postgres. Mirrors db/migrations/0140_auth_rate_limits.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: one SELECT. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed code reads and writes auth_rate_limits on
-- every sign-in, sign-up and reset request in production; without the table those requests fail. run4 only
-- to undo run2, with the code from before this push deployed.
--
-- Expected result: one row -- table_exists = f (t if run2 already ran), app_role_exists = t.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'auth_rate_limits'
  ) AS table_exists,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app') AS app_role_exists;
