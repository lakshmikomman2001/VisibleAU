-- 0054-rate-limit-counters-apply-prod.sql (task #46, 17th follow-up)
--
-- Run on the PRODUCTION branch (Neon SQL editor) AFTER
-- 0054-...-precheck-prod.sql confirms the table is missing.
--
-- ⚠️ APPLY-BEFORE-PUSH: this follow-up's code
-- (lib/governance/pg-rate-limit.ts, called from
-- lib/sample-audit/rate-limit.ts whenever UPSTASH_REDIS_REST_URL/TOKEN
-- are unset) reads/writes rate_limit_counters unconditionally once that
-- fallback path is reached. Deploying the code before this table exists
-- means every sample-audit-creation request would 42P01 (relation does
-- not exist) the moment Redis isn't configured -- apply this FIRST,
-- confirm the post-check below, THEN push.
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

-- POST-CHECK -- expect table_exists = true, unique_constraint_present =
-- true, index_present = true.
SELECT
  (EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limit_counters')) AS table_exists,
  (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limit_counters_bucket_key_key')) AS unique_constraint_present,
  (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'rate_limit_counters_window_start_idx')) AS index_present;
