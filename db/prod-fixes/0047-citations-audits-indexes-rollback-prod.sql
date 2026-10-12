-- Rollback for task #46 (6th follow-up)'s two new indexes. Only needed
-- if 0047-citations-audits-indexes-apply-prod.sql caused a problem
-- (e.g. unexpectedly slow build on a much larger prod table than the
-- local 72,000-row bench, or disk pressure) -- both indexes are
-- read-path performance only, so dropping them is always safe
-- correctness-wise; it just returns both queries to a Seq Scan.
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- IMPORTANT: CONCURRENTLY cannot run inside a transaction block. Run
-- EACH statement below as its own standalone statement in the Neon SQL
-- editor, same as the apply file.

-- Statement 1 of 2 -- run alone, wait for it to finish.
DROP INDEX CONCURRENTLY IF EXISTS citations_audit_run_idx;

-- Statement 2 of 2 -- run alone, after statement 1 finishes.
DROP INDEX CONCURRENTLY IF EXISTS audits_brand_completed_idx;
