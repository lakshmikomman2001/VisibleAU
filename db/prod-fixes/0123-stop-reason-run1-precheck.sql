-- 0123-stop-reason-run1-precheck.sql (Vunnara, 6 Nov, "Mention detection",
-- part 2)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that writes the columns -- both audit runners
-- (inngest/functions/run-audit.ts, lib/audit/run-audit-inline.ts) insert
-- citations.stop_reason and citations.answer_truncated on every answer, and
-- every answer of every audit would fail (42703, column does not exist)
-- until run2 has run. A failure with the new class 'incomplete_answer' would
-- fail too (23514, check violation).
-- Mirrors db/migrations/0123_citations_stop_reason_incomplete_answer.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration adds two nullable columns and widens a CHECK
-- by one value; no existing row changes.
--
-- Expected result: one row --
--   both *_present = f;
--   error_class_check = the seven classes from migration 0089
--     (rate_limited ... other), without 'incomplete_answer';
--   failure_rows_outside_new_check = 0 (run2's re-added CHECK validates every
--     existing row; a row with any other class would make run2 fail);
--   the row counts, and audits_in_flight (run2 is safe either way: its locks
--     are short, and an audit's insert waits for them).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'stop_reason'
  ) AS stop_reason_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'answer_truncated'
  ) AS answer_truncated_present,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conname = 'engine_call_failures_error_class_check') AS error_class_check,
  (SELECT count(*) FROM engine_call_failures
   WHERE error_class NOT IN ('rate_limited', 'overloaded', 'timeout', 'search_tool_error',
                             'empty_response', 'parse_error', 'other', 'incomplete_answer'))
    AS failure_rows_outside_new_check,
  (SELECT count(*) FROM citations) AS citations_rows,
  (SELECT count(*) FROM engine_call_failures) AS failure_rows,
  (SELECT count(*) FROM audits WHERE status IN ('pending', 'running')) AS audits_in_flight;
