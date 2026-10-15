-- 0054-rate-limit-counters-run1-apply.sql (task #46, 17th/19th follow-ups)
-- PRODUCTION branch. Run on its own, as one editor submission.
--
-- What it does: creates rate_limit_counters (a brand-new table), its
-- UNIQUE constraint on bucket_key, and an index on window_start for the
-- daily cleanup delete.
-- Expected result: "Statement executed successfully". Then run
-- 0054-rate-limit-counters-run2-post-check.sql.
--
-- Run AFTER 0054-rate-limit-counters-precheck-prod.sql confirms the
-- table is missing.
--
-- ⚠️ APPLY-BEFORE-PUSH: lib/governance/pg-rate-limit.ts (called from
-- lib/sample-audit/rate-limit.ts whenever Redis is unreachable or its
-- env vars are missing) reads/writes rate_limit_counters unconditionally
-- once that fallback path is reached. Deploying the code before this
-- table exists means that fallback would 42P01 (relation does not
-- exist) the moment Redis ever becomes unavailable -- apply this FIRST,
-- confirm run2's post-check, THEN push.
--
-- Task #46 (19th follow-up): no DEFAULT needed on bucket_key/window_start
-- despite being NOT NULL -- unlike 0053's org_members.expires_at, this is
-- a BRAND NEW table with no pre-existing writer. The only code that will
-- ever insert into it is the new checkPostgresRateLimit(), part of this
-- same deploy, which always supplies both columns explicitly -- there is
-- no older, already-live code path that could insert a row without them.
--
-- Plain (non-CONCURRENTLY) DDL -- this table starts empty, no live
-- traffic contention to worry about.
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

COMMIT;
