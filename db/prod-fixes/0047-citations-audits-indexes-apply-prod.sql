-- Task #46 (6th follow-up): create citations_audit_run_idx and
-- audits_brand_completed_idx on prod -- ONLY for whichever index
-- 0047-citations-audits-indexes-precheck-prod.sql's query 1 shows is
-- missing or whose indexdef doesn't match. If the precheck already
-- shows both correct, DO NOT run this file.
--
-- Sri-authorized only. NOT run from Claude Code.
-- Take a Neon snapshot/branch before running this (per CLAUDE.md's
-- "pg_dump backup first" rule), even though both CREATE INDEX
-- CONCURRENTLY IF NOT EXISTS statements are additive-only and
-- read-path performance only -- the code does not depend on either
-- index existing (NOT apply-before-push).
--
-- Matches db/migrations/0040_citations_audits_hot_path_indexes.sql's
-- definitions exactly.
--
-- IMPORTANT: CONCURRENTLY cannot run inside a transaction block. Run
-- EACH statement below as its own standalone statement in the Neon SQL
-- editor -- not wrapped in BEGIN/COMMIT, and not pasted together in one
-- batch if your editor auto-wraps a multi-statement paste in a
-- transaction. Run statement 1, confirm it finishes, THEN run
-- statement 2.

-- Statement 1 of 2 -- run alone, wait for it to finish.
CREATE INDEX CONCURRENTLY IF NOT EXISTS citations_audit_run_idx
  ON citations (audit_id, run_number);

-- Statement 2 of 2 -- run alone, after statement 1 finishes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS audits_brand_completed_idx
  ON audits (brand_id, completed_at DESC)
  WHERE status = 'complete';

-- Verify both indexes are valid (CONCURRENTLY can leave a half-built,
-- invalid index behind if it's interrupted -- indisvalid = false means
-- DROP INDEX CONCURRENTLY it and retry, not that the data is wrong).
SELECT indexrelid::regclass AS index_name, indisvalid
FROM pg_index
WHERE indexrelid IN ('citations_audit_run_idx'::regclass, 'audits_brand_completed_idx'::regclass);
