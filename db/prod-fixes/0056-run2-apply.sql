-- 0056 RUN 2 of 3 -- PRODUCTION branch. Adds citations.is_cache_hit (one transaction).
-- Safe for the code that's live now: it doesn't know the column, and new rows get DEFAULT false.
-- NOT NULL + constant DEFAULT is metadata-only on Postgres 11+ (no table rewrite).
-- Expected: "Statement executed successfully" on every tab.
BEGIN;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS is_cache_hit boolean NOT NULL DEFAULT false;
COMMIT;
