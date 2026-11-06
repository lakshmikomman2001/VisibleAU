-- 0123-stop-reason-run2-apply.sql (Vunnara, 6 Nov, "Mention detection",
-- part 2)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql, and BEFORE the push (the new
-- runners write these columns on every answer from the moment they deploy).
-- Sri-authorized only. NOT run from Claude Code.
--
-- ADD COLUMN is metadata-only (nullable, no default): no row rewrite. The
-- CHECK is dropped and re-added in one ALTER TABLE, which holds
-- engine_call_failures' lock while it reads that table once to validate --
-- an audit recording a failed call at that moment waits for it, it doesn't
-- fail. citations is never scanned.
--
-- Expected result: "Statement executed successfully", then one row with
-- both *_present = t and new_check_includes_incomplete_answer = t.
BEGIN;

ALTER TABLE citations ADD COLUMN IF NOT EXISTS stop_reason text;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS answer_truncated boolean;

ALTER TABLE engine_call_failures
  DROP CONSTRAINT IF EXISTS engine_call_failures_error_class_check,
  ADD CONSTRAINT engine_call_failures_error_class_check CHECK (error_class IN (
    'rate_limited', 'overloaded', 'timeout', 'search_tool_error',
    'empty_response', 'parse_error', 'other', 'incomplete_answer'
  ));

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'stop_reason'
  ) AS stop_reason_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'answer_truncated'
  ) AS answer_truncated_present,
  (SELECT pg_get_constraintdef(oid) LIKE '%incomplete_answer%' FROM pg_constraint
   WHERE conname = 'engine_call_failures_error_class_check') AS new_check_includes_incomplete_answer;
