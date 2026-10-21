-- 0089-engine-call-failures-rollback.sql (Vunnara, 21 Oct, "audit
-- reliability", Part A)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- safe
-- only BEFORE the code that writes this table is deployed. If the
-- deploy already happened, DO NOT drop this table -- real failure
-- records would be lost. Re-run run2-apply.sql instead (idempotent,
-- IF NOT EXISTS) if something about the DDL itself needs correcting.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- table_present = f.
BEGIN;

DROP TABLE IF EXISTS "engine_call_failures";

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'engine_call_failures'
  ) AS table_present;
