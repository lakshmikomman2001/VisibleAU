-- diag-0128-claude-timeouts.sql (methodology v2.2 part 4, 7 Nov): what the
-- "~61 s" Claude timeouts in diag-0121 query 4 were.
--
-- diag-0121 (Sri, 7 Nov) found 4 Claude timeouts, latency p50 60,708 ms and
-- max 60,976 ms, with a 75 s per-call timeout configured. Two readings:
--   (a) a platform limit (e.g. a 60 s function duration) killing the call
--       before our timeout fires; or
--   (b) the old 30 s timeout with its one retry: lib/llm/with-retry.ts's
--       latency_ms covers every attempt, so two 30,000 ms attempts plus the
--       first retry's 500-1,000 ms backoff land between 60,500 and 61,000 ms.
--       Claude's timeout went from 30 s to 75 s in 250a713 (committed 23 Oct
--       2026, 07:42 AEDT; live once that push deployed), and diag-0121's
--       query 4 covers every audit created in the 30 days before 7 Nov.
-- (a) can't write these rows: a function the platform stops at 60 s never
-- reaches its failure insert, let alone stamp it with 60.7 s. This file
-- shows which it was: each row's attempts and time per attempt (about 30,000
-- ms each under the old timeout, about 75,000 under the new one), and when.
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECTs only, inside a READ ONLY
-- transaction that ends in ROLLBACK. Dates, audit numbers, engines, error
-- classes, attempts, milliseconds and counts only -- no prompt or message
-- text. Sri runs it; NOT run from Claude Code against production.
--
-- Expected, if (b): every Claude timeout has attempts = 2, ms_per_attempt
-- near 30,000 and vs_75s_commit = 'before'; query 2 has no row for
-- 'after' with error_class 'timeout'; query 3's longest_failure_ms is above
-- 60,000 (a function writing a row after a minute -- no 60 s cap).

BEGIN TRANSACTION READ ONLY;

-- 1. Every Claude failure in audits created in the last 45 days.
SELECT
  (f.created_at AT TIME ZONE 'Australia/Sydney')::date AS sydney_date,
  to_char(f.created_at AT TIME ZONE 'Australia/Sydney', 'HH24:MI') AS sydney_time,
  a.audit_number,
  f.error_class,
  f.attempts,
  f.latency_ms,
  round(f.latency_ms::numeric / nullif(f.attempts, 0)) AS ms_per_attempt,
  CASE
    WHEN f.created_at < timestamptz '2026-10-23 07:42:40+11' THEN 'before'
    ELSE 'after'
  END AS vs_75s_commit
FROM engine_call_failures f
JOIN audits a ON a.id = f.audit_id
WHERE f.engine = 'claude'
  AND a.created_at >= now() - interval '45 days'
ORDER BY f.created_at;

-- 2. The same, counted: per error class, attempts, and before or after the
-- 75 s commit -- with the latency range.
SELECT
  f.error_class,
  f.attempts,
  CASE
    WHEN f.created_at < timestamptz '2026-10-23 07:42:40+11' THEN 'before'
    ELSE 'after'
  END AS vs_75s_commit,
  count(*) AS failures,
  min(f.latency_ms) AS latency_ms_min,
  percentile_disc(0.5) WITHIN GROUP (ORDER BY f.latency_ms) AS latency_ms_p50,
  max(f.latency_ms) AS latency_ms_max
FROM engine_call_failures f
JOIN audits a ON a.id = f.audit_id
WHERE f.engine = 'claude'
  AND a.created_at >= now() - interval '45 days'
GROUP BY 1, 2, 3
ORDER BY 3, 1, 2;

-- 3. Has any call, on any engine, been recorded after running more than a
-- minute? Each such row was written by a function still running at that point.
SELECT
  count(*) FILTER (WHERE f.latency_ms > 60000) AS failures_over_60s,
  max(f.latency_ms) AS longest_failure_ms,
  max(f.created_at) FILTER (WHERE f.latency_ms > 60000) AT TIME ZONE 'Australia/Sydney'
    AS last_over_60s_sydney
FROM engine_call_failures f
JOIN audits a ON a.id = f.audit_id
WHERE a.created_at >= now() - interval '45 days';

ROLLBACK;
