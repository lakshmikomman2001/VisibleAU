-- 0093-citations-engine-call-failures-prompt-index-run2-apply.sql
-- (Vunnara, 22 Oct, "audits time out on Vercel", item 2)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql, and BEFORE the push (the
-- new code reads/writes prompt_index and relies on the unique index
-- from the moment it deploys).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Nullable + no DEFAULT is metadata-only on Postgres for the two
-- ADD COLUMNs (no table rewrite). The two CREATE UNIQUE INDEX
-- statements are NOT CONCURRENTLY -- unlike migration 0092's index,
-- these are on citations/engine_call_failures, both written to
-- continuously by every in-flight audit; a brief ACCESS SHARE-
-- compatible lock during a plain CREATE UNIQUE INDEX blocks
-- CONCURRENT WRITERS only for the (fast, metadata-scale) build
-- itself, which is fine inside one transaction here -- CONCURRENTLY
-- can't run inside a transaction block at all, and splitting this
-- into 2 non-transactional CONCURRENTLY steps per table (4 total)
-- for an index build that's expected to be near-instant (every
-- existing row's prompt_index is NULL, so there's nothing to scan
-- for conflicts yet) isn't worth the extra steps. Run PGBUILD during
-- a quiet moment if a non-blocking build is still preferred.
--
-- Expected result: "Statement executed successfully" on every tab.
BEGIN;

ALTER TABLE citations ADD COLUMN IF NOT EXISTS prompt_index integer;
ALTER TABLE engine_call_failures ADD COLUMN IF NOT EXISTS prompt_index integer;

CREATE UNIQUE INDEX IF NOT EXISTS citations_audit_engine_prompt_idx_unique_idx
  ON citations (audit_id, engine, prompt_index);

CREATE UNIQUE INDEX IF NOT EXISTS engine_call_failures_audit_engine_prompt_idx_unique_idx
  ON engine_call_failures (audit_id, engine, prompt_index);

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'prompt_index'
  ) AS citations_column_present,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'citations' AND indexname = 'citations_audit_engine_prompt_idx_unique_idx'
  ) AS citations_index_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engine_call_failures' AND column_name = 'prompt_index'
  ) AS engine_call_failures_column_present,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'engine_call_failures'
      AND indexname = 'engine_call_failures_audit_engine_prompt_idx_unique_idx'
  ) AS engine_call_failures_index_present;
