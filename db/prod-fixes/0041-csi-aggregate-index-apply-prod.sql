-- Task #41: create csi_unique_aggregate on prod -- ONLY if
-- 0041-csi-aggregate-index-precheck-prod.sql's query 1 shows it's
-- missing, or its indexdef doesn't match (columns
-- (brand_id, engine, source_type), predicate WHERE (audit_id IS NULL)).
-- If the precheck already shows a correct csi_unique_aggregate, DO NOT
-- run this file -- re-confirm with the precheck and go straight to
-- pushing cbe2868 + the follow-up commit.
--
-- Sri-authorized only. NOT run from Claude Code.
-- Take a Neon snapshot/branch before running this (per CLAUDE.md's
-- "pg_dump backup first" rule), even though CREATE INDEX CONCURRENTLY
-- IF NOT EXISTS is low-risk and additive-only.
--
-- Matches db/migrations/0010_baseline-reconcile.sql /
-- db/migrations/0016_phase2_sprint5_trust.sql's definition exactly.
--
-- IMPORTANT: CONCURRENTLY cannot run inside a transaction block. Run
-- this as its own standalone statement in the Neon SQL editor (not
-- wrapped in BEGIN/COMMIT, and not pasted alongside other statements in
-- one batch if your editor auto-wraps multi-statement pastes in a
-- transaction).

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS csi_unique_aggregate
  ON citation_source_intelligence (brand_id, engine, source_type)
  WHERE audit_id IS NULL;

-- Verify: re-run 0041-csi-aggregate-index-precheck-prod.sql's query 1
-- and confirm csi_unique_aggregate now appears with the correct
-- indexdef before pushing cbe2868.
