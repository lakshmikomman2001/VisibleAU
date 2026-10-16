-- Applies migration 0044 to prod: adds citations.is_cache_hit.
-- Verbatim-equivalent to db/migrations/0044_citations_is_cache_hit.sql.
--
-- Sri-authorized only. NOT run from Claude Code.
-- Snapshot -> precheck -> apply -> re-precheck -> THEN deploy (push the
-- commit that adds is_cache_hit to the schema/app code). Additive,
-- NOT NULL WITH a constant DEFAULT -- a metadata-only change in
-- Postgres 11+, no table rewrite regardless of table size, so this is
-- fast and low-risk even applied directly (no separate ADD-then-
-- backfill-then-SET-NOT-NULL steps needed, unlike migration 0042's
-- expires_at, whose backfill value varied per row).

BEGIN;

ALTER TABLE citations ADD COLUMN IF NOT EXISTS is_cache_hit boolean NOT NULL DEFAULT false;

COMMIT;

-- Verify: re-run 0044-citations-is-cache-hit-precheck-prod.sql's query 1
-- and confirm is_cache_hit now appears, with column_default = 'false'
-- and is_nullable = 'NO'.
