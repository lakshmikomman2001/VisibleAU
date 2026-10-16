-- 0057 RUN 2 of 3 -- PRODUCTION branch. Adds citations.response_text (one transaction).
-- Safe for the code that's live now: it doesn't know the column, and new rows just get NULL.
-- Nullable + no DEFAULT is metadata-only on Postgres (no table rewrite) -- same reasoning
-- as 0056's is_cache_hit column. Existing rows stay NULL = "full answer not captured".
-- Expected: "Statement executed successfully" on every tab.
-- Sri-authorized only. NOT run from Claude Code.
BEGIN;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS response_text text;
COMMIT;
