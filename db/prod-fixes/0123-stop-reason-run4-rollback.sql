-- 0123-stop-reason-run4-rollback.sql (Vunnara, 6 Nov, "Mention detection",
-- part 2)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that writes the columns has been rolled back (both
-- audit runners) -- dropping them while that code is live fails every answer
-- of every audit with 42703 (column does not exist).
--
-- The old CHECK has no 'incomplete_answer', so any failure recorded with it
-- since run2 is first relabelled 'other'. Its error_message ("Answer
-- incomplete: ..." / "Provider stopped the answer ...") is kept, so the
-- reason shown stays the same: lib/audit/engine-failure.ts reads the
-- message's category before the class. Dropping the columns loses only the
-- stop reasons and truncated flags recorded since run2. Nothing else
-- changes, so nothing was backed up.
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then both *_present = f
-- and incomplete_answer_failures = 0.
BEGIN;

UPDATE engine_call_failures SET error_class = 'other' WHERE error_class = 'incomplete_answer';

ALTER TABLE engine_call_failures
  DROP CONSTRAINT IF EXISTS engine_call_failures_error_class_check,
  ADD CONSTRAINT engine_call_failures_error_class_check CHECK (error_class IN (
    'rate_limited', 'overloaded', 'timeout', 'search_tool_error',
    'empty_response', 'parse_error', 'other'
  ));

ALTER TABLE citations DROP COLUMN IF EXISTS stop_reason;
ALTER TABLE citations DROP COLUMN IF EXISTS answer_truncated;

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
  (SELECT count(*) FROM engine_call_failures WHERE error_class = 'incomplete_answer')
    AS incomplete_answer_failures;
