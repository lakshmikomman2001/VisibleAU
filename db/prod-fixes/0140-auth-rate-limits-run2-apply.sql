-- 0140-auth-rate-limits-run2-apply.sql (live invite test follow-ups, part 5): the table better-auth keeps its
-- rate limits in, shared by every serverless instance. Mirrors db/migrations/0140_auth_rate_limits.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: creates one empty table (its key
-- unique), and grants the app role what prod-fix 0052 grants on every table. Run after run1, BEFORE the
-- push. Sri-authorized only; NOT run from Claude Code. Undone by run4.
--
-- Zero downtime: the code deployed now never touches the table (its limits are in memory); the pushed code
-- needs it from its first request. Idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id text PRIMARY KEY,
  key text NOT NULL CONSTRAINT auth_rate_limits_key_unique UNIQUE,
  count integer NOT NULL,
  last_request bigint NOT NULL
);

-- What prod-fix 0052's default privileges give any new table, stated in case this runs as another role.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_rate_limits TO visibleau_app;

COMMIT;
