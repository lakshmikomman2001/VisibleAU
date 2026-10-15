-- Migration 0043 (task #46, 17th follow-up): a Postgres-backed fallback
-- fixed-window rate limiter for cost-incurring public endpoints, used
-- only when the shared Upstash/Redis limiter is unconfigured -- see
-- lib/governance/pg-rate-limit.ts. Global/platform-wide table (no
-- organization_id -- counts anonymous callers by hashed IP, not by
-- tenant), so no RLS policy applies; added to RLS_EXEMPT_GLOBAL_TABLES
-- in scripts/qa/schema-drift.ts.
--
-- bucket_key already encodes the window (e.g.
-- "sample-audit-create:<sha256(ip+salt)>:<windowStartISO>"), so a plain
-- UNIQUE constraint on it alone is enough to make a new window a new
-- row via a single upsert (ON CONFLICT (bucket_key) DO UPDATE SET
-- count = count + 1) -- no composite key needed, one write per request.
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

-- Cleanup cadence is handled by inngest/functions/sample-audit-cleanup.ts
-- (already a daily cron, extended to also delete counter rows older
-- than its own cutoff) -- no additional index needed for that single
-- `window_start < cutoff` delete against a table this small.
CREATE INDEX IF NOT EXISTS rate_limit_counters_window_start_idx ON rate_limit_counters (window_start);
