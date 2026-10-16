-- Rollback for 0044-citations-is-cache-hit-apply-prod.sql / migration 0044.
--
-- Only safe to run if the app code that writes is_cache_hit has
-- already been rolled back first -- dropping the column while
-- lib/audit/run-audit-inline.ts / inngest/functions/run-audit.ts still
-- insert into it explicitly would 42703 (column does not exist) on the
-- very next audit run, the same failure mode in reverse that the
-- apply file's own header warns about. Once the app code is rolled
-- back: safe, no FK/index dependents, the audit page's LLM-calls
-- header falls back to its pre-existing cost_estimate_usd = 0
-- inference for live/cached counting, same as before this migration.
--
-- Sri-authorized only. NOT run from Claude Code.

ALTER TABLE citations DROP COLUMN IF EXISTS is_cache_hit;
