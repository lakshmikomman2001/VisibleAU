-- diag-0090-engine-failures-7day.sql (Vunnara, 21 Oct, "audit
-- reliability", Part A)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT
-- run from Claude Code -- there is no prod access from that
-- environment. Sri-authorized only.
--
-- Run AFTER the push (engine_call_failures only exists, and only gets
-- written to, once this hotfix's code is live -- running this before
-- the push would just show zero rows).
--
-- Failures by engine and class over the last 7 days -- the real
-- picture production audit #30 (Claude 4 of 13, no detail recorded)
-- never had.
SELECT
  engine,
  error_class,
  count(*) AS failure_count,
  round(avg(attempts), 2) AS avg_attempts,
  round(avg(latency_ms)) AS avg_latency_ms,
  round(sum(cost_usd)::numeric, 4) AS total_cost_usd_billed_on_failed_calls
FROM engine_call_failures
WHERE created_at >= now() - interval '7 days'
GROUP BY engine, error_class
ORDER BY engine, failure_count DESC;

-- Totals, same window.
SELECT
  count(*) AS total_failures_7d,
  count(DISTINCT audit_id) AS audits_with_a_failure_7d,
  round(sum(cost_usd)::numeric, 4) AS total_cost_usd_billed_on_failed_calls_7d
FROM engine_call_failures
WHERE created_at >= now() - interval '7 days';
