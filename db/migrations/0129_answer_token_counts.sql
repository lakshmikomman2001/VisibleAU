-- Migration 0129 (Vunnara, 7 Nov, methodology v2.2 part 7): each answer's
-- input and output tokens, as its provider reported them, next to the total
-- already stored (citations.llm_tokens_used). diag-0121 had to estimate an
-- answer's length from its characters, because only the total -- input
-- (the question, plus the search results a web-searched answer read) and
-- output together -- was kept.
--
-- citations.llm_input_tokens   the provider's input tokens for the call (the
--                              sum over every request of a continued Claude
--                              turn).
-- citations.llm_output_tokens  the provider's output tokens, the answer's own
--                              (Gemini's thinking tokens included, as Google
--                              bills them).
--
-- Nullable, no default, no backfill: NULL when the provider reported no
-- figure, for a cache hit (no call was made), and for every row before this
-- migration. Never estimated.

ALTER TABLE citations ADD COLUMN IF NOT EXISTS llm_input_tokens integer;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS llm_output_tokens integer;
