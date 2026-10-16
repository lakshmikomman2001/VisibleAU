-- READ-ONLY precheck for migration 0044 (citations.is_cache_hit).
-- Run this against prod BEFORE applying
-- 0044-citations-is-cache-hit-apply-prod.sql. Nothing in this file
-- writes anything. NOT run from Claude Code.
--
-- IMPORTANT -- apply-before-deploy, not just recommended: once the app
-- code (is_cache_hit added to db/schema/citations.ts) ships, EVERY
-- insert into `citations` for EVERY engine (lib/audit/run-audit-inline.ts,
-- inngest/functions/run-audit.ts) writes this column explicitly via
-- Drizzle. Unlike migration 0038's cited_urls (which the cache layer
-- already degrades gracefully around if missing), nothing in the
-- citations insert path currently has a "column might not exist yet"
-- guard -- applying the column first avoids a hard insert failure on
-- the very next audit run after deploy.

-- 1. Does citations.is_cache_hit already exist?
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'citations' AND column_name = 'is_cache_hit';

-- 2. Context only: current citations table size (informational, not
-- acted on -- a constant-DEFAULT ADD COLUMN is a metadata-only change
-- in Postgres 11+, not a full table rewrite, regardless of size).
SELECT count(*) AS total_citation_rows FROM citations;
