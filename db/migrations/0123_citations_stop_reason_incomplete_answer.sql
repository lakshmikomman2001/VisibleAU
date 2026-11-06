-- Migration 0123 (Vunnara, 6 Nov, "Mention detection: stop losing brand names
-- to text gluing, early stops, markup and invisible characters", part 2): why
-- a provider stopped writing an answer, and a failure class for an answer it
-- didn't finish.
--
-- citations.stop_reason: the provider's own stop reason when it gave one
--   ("end_turn", "max_tokens", "STOP", "MAX_TOKENS", "max_output_tokens",
--   Perplexity's "length"), else the AI SDK's word ("stop") --
--   lib/llm/stop-reason.ts.
-- citations.answer_truncated: true when the answer hit the output limit. It's
--   kept (part of an answer can still name the brand) and flagged on its
--   answer row.
--   Both NULL for a cache hit (no call was made) and for every row written
--   before this migration. Nullable, no default, no backfill.
--
-- engine_call_failures.error_class gains 'incomplete_answer': Claude's turn
--   still paused (pause_turn) after being sent back to carry on 3 times, or
--   continuing it failed, or a provider's own filter stopped the answer
--   (Gemini RECITATION / SAFETY, OpenAI content_filter, Claude refusal).
--   Never stored or scored as an answer. The check is 0089's inline one
--   (auto-named engine_call_failures_error_class_check), the same seven
--   classes plus this one. It is dropped and re-added in one statement, so
--   running this again changes nothing.

ALTER TABLE citations ADD COLUMN IF NOT EXISTS stop_reason text;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS answer_truncated boolean;

ALTER TABLE engine_call_failures
  DROP CONSTRAINT IF EXISTS engine_call_failures_error_class_check,
  ADD CONSTRAINT engine_call_failures_error_class_check CHECK (error_class IN (
    'rate_limited', 'overloaded', 'timeout', 'search_tool_error',
    'empty_response', 'parse_error', 'other', 'incomplete_answer'
  ));
