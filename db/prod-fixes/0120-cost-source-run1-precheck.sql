-- 0120-cost-source-run1-precheck.sql (Vunnara, 6 Nov, "Record costs from what
-- each provider actually reports", item 1)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that writes the columns -- both audit runners
-- (inngest/functions/run-audit.ts, lib/audit/run-audit-inline.ts) insert
-- citations.llm_cost_source and engine_call_failures.cost_source, and every
-- answer of every audit would fail (42703, column does not exist) until run2
-- has run.
-- Mirrors db/migrations/0120_citations_engine_call_failures_cost_source.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration only adds two nullable columns and their
-- CHECKs; no existing row changes.
--
-- Expected result: one row -- both *_present = f, both *_check_present = f,
-- the real row counts (run2's CHECKs scan these rows once, under a short
-- lock), and audits_in_flight (run2 is safe either way; with 0 nothing waits
-- on its lock).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_cost_source'
  ) AS citations_column_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engine_call_failures' AND column_name = 'cost_source'
  ) AS failures_column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'citations_llm_cost_source_check'
  ) AS citations_check_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engine_call_failures_cost_source_check'
  ) AS failures_check_present,
  (SELECT count(*) FROM citations) AS citations_rows,
  (SELECT count(*) FROM engine_call_failures) AS failure_rows,
  (SELECT count(*) FROM audits WHERE status IN ('pending', 'running')) AS audits_in_flight;
