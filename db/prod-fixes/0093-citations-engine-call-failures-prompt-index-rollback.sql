-- 0093-citations-engine-call-failures-prompt-index-rollback.sql
-- (Vunnara, 22 Oct, "audits time out on Vercel", item 2)
--
-- PRODUCTION branch. Run on its own, as one editor submission. Only
-- safe to run if the app code that writes AND reads prompt_index (or
-- relies on the ON CONFLICT (audit_id, engine, prompt_index) target)
-- has already been rolled back first -- dropping the column while
-- inngest/functions/run-audit.ts / lib/audit/run-audit-inline.ts
-- still insert into it, or rely on the index for ON CONFLICT, would
-- 42703 (column does not exist) / 42P10 (no matching unique
-- constraint) on the very next audit call.
--
-- Once the app code is rolled back: safe, no FK or other dependents
-- on either column/index (checked pg_depend directly).
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully" x4, then both
-- column_present = f.
ALTER TABLE citations DROP COLUMN IF EXISTS prompt_index;
ALTER TABLE engine_call_failures DROP COLUMN IF EXISTS prompt_index;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'prompt_index'
  ) AS citations_column_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engine_call_failures' AND column_name = 'prompt_index'
  ) AS engine_call_failures_column_present;
