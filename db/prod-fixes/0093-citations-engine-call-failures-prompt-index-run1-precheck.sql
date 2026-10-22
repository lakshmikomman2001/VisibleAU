-- 0093-citations-engine-call-failures-prompt-index-run1-precheck.sql
-- (Vunnara, 22 Oct, "audits time out on Vercel", item 2)
--
-- PRODUCTION branch. READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that writes citations/engine_call_failures with
-- ON CONFLICT (audit_id, engine, prompt_index) DO NOTHING. That code
-- would throw "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification" on its very first real call if this
-- hasn't been applied yet.
-- Mirrors db/migrations/0093_citations_engine_call_failures_prompt_index.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row, citations_column_present = f,
-- citations_index_present = f, engine_call_failures_column_present =
-- f, engine_call_failures_index_present = f.
--
-- existing_citations_duplicate_audit_engine_prompt_groups and
-- existing_failures_duplicate_audit_engine_prompt_groups are
-- DIAGNOSTIC, not a blocking precondition: the new column is
-- additive and every existing row gets prompt_index = NULL, which
-- Postgres never treats as equal to another NULL in a unique index
-- -- the apply below is safe regardless of what these two numbers
-- are. A non-zero count here means some PAST (audit_id, engine,
-- prompt) triple already has more than one row (the production
-- 504-retry bug this follow-up fixes, already having happened before
-- this fix existed) -- worth knowing, never worth blocking on, since
-- there's no way to retroactively assign those old rows a prompt_index.
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
  ) AS engine_call_failures_index_present,
  (SELECT count(*) FROM (
    SELECT audit_id, engine, prompt FROM citations GROUP BY audit_id, engine, prompt HAVING count(*) > 1
  ) dupes) AS existing_citations_duplicate_audit_engine_prompt_groups,
  (SELECT count(*) FROM (
    SELECT audit_id, engine, prompt FROM engine_call_failures GROUP BY audit_id, engine, prompt HAVING count(*) > 1
  ) dupes) AS existing_failures_duplicate_audit_engine_prompt_groups;
