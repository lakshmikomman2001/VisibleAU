-- 0127-failure-cost-unknown-run1-precheck.sql (Vunnara, 7 Nov, methodology
-- v2.2 part 4: a timed-out call's cost is unknown, never $0)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that records the unknown cost -- both audit runners insert
-- engine_call_failures.cost_usd = NULL for a call that timed out, which fails
-- (23502, not-null violation) until run2 has run, and the failure row is then
-- lost.
-- Mirrors db/migrations/0127_failure_cost_unknown.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: run2 only drops a NOT NULL; no value changes. (The optional
-- run2b changes values: its own header says what.)
--
-- Expected result:
--   query 1: one row -- cost_usd_nullable = NO, its default 0, and
--            the row counts.
--   query 2: the timed-out calls recorded so far, per engine and month: how
--            many, and how many carry exactly $0 (every one before this
--            change: an aborted call returned no usage). These are the rows
--            run2b would mark as unknown. Counts only.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_usd') AS cost_usd_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'engine_call_failures' AND column_name = 'cost_usd') AS cost_usd_default,
  (SELECT count(*) FROM engine_call_failures) AS failure_rows,
  (SELECT count(*) FROM engine_call_failures WHERE error_class = 'timeout') AS timeout_rows;

SELECT
  f.engine,
  to_char(f.created_at AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS sydney_month,
  count(*) AS timeouts,
  count(*) FILTER (WHERE f.cost_usd = 0) AS recorded_as_zero,
  count(*) FILTER (WHERE f.cost_usd > 0) AS recorded_above_zero
FROM engine_call_failures f
WHERE f.error_class = 'timeout'
GROUP BY 1, 2
ORDER BY 1, 2;
