-- 0127-failure-cost-unknown-run2b-backfill-timeouts.sql (Vunnara, 7 Nov,
-- methodology v2.2 part 4) -- OPTIONAL, Sri's call.
--
-- PRODUCTION branch (Neon). Only after run2-apply.sql. Run on its own, as one
-- editor submission. Sri-authorized only. NOT run from Claude Code.
--
-- What it changes: every past failed call whose last attempt timed out
-- (error_class = 'timeout') had its cost recorded as a number -- $0 for the
-- aborted attempt, which returned no usage (run1's query 2 counts them). That
-- $0 was never measured. This marks those rows' cost as unknown (NULL), the
-- way the new code records a timeout, so those audits' cost reads "Cost
-- incomplete: n calls timed out" instead of understating spend. A row whose
-- cost was above $0 (an earlier attempt billed, then a timeout) becomes
-- unknown too: its total is unknown.
-- Skip it to leave past audits' figures exactly as they are; nothing else
-- depends on it.
--
-- Rollback: run4-rollback.sql puts $0 back (it can't tell which rows this
-- changed from rows written as NULL by the new code; both become $0).
--
-- Expected result: "UPDATE n" with n = run1 query 2's timeouts summed, then
-- one row: timeout_rows_with_cost = 0.
BEGIN;

UPDATE engine_call_failures
SET cost_usd = NULL
WHERE error_class = 'timeout'
  AND cost_usd IS NOT NULL;

COMMIT;

SELECT
  count(*) FILTER (WHERE cost_usd IS NOT NULL) AS timeout_rows_with_cost,
  count(*) FILTER (WHERE cost_usd IS NULL) AS timeout_rows_unknown
FROM engine_call_failures
WHERE error_class = 'timeout';
