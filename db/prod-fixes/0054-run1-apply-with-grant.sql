-- 0054 RUN 1 -- PRODUCTION branch. Creates rate_limit_counters (one transaction).
-- Run AFTER 0054-rate-limit-counters-precheck-prod.sql shows table_missing_as_expected = t.
-- Expected: "Statement executed successfully" on every tab. Then run 0054-run2-post-check-with-grant.sql.
--
-- Same as Claude Code's 0054-rate-limit-counters-run1-apply.sql, plus ONE added
-- statement: an explicit GRANT to visibleau_app. The table is created by the
-- owner role (neondb_owner); without this grant, if the fallback limiter runs on
-- the app's restricted connection it would fail with "permission denied" -- and
-- because sample-audit creation FAILS CLOSED, every sample audit would be refused.
-- If the limiter actually uses the owner connection, the grant is simply unused.
BEGIN;

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'rate_limit_counters_bucket_key_key'
                   AND conrelid = 'rate_limit_counters'::regclass) THEN
    ALTER TABLE rate_limit_counters ADD CONSTRAINT rate_limit_counters_bucket_key_key UNIQUE (bucket_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_start_idx ON rate_limit_counters (window_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_counters TO visibleau_app;

COMMIT;
