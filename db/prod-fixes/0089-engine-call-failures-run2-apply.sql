-- 0089-engine-call-failures-run2-apply.sql (Vunnara, 21 Oct, "audit
-- reliability", Part A)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql confirms the table is
-- missing.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Creates engine_call_failures -- every failed (engine, prompt) call,
-- additive (never overloads citations). FORCE RLS, direct
-- organization_id column. Identical DDL to db/migrations/
-- 0089_engine_call_failures.sql.
--
-- Expected result: "Statement executed successfully", then
-- table_present = t, rls_enabled = t, rls_forced = t,
-- policy_count = 4, app_role_has_all_four_privileges = t.
BEGIN;

CREATE TABLE IF NOT EXISTS "engine_call_failures" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "audit_id"          UUID NOT NULL REFERENCES "audits"("id"),
  "organization_id"   UUID NOT NULL REFERENCES "organizations"("id"),
  "engine"            TEXT NOT NULL,
  "prompt"            TEXT NOT NULL,
  "is_branded_prompt" BOOLEAN NOT NULL,
  "error_class"       TEXT NOT NULL CHECK ("error_class" IN
                         ('rate_limited', 'overloaded', 'timeout', 'search_tool_error',
                          'empty_response', 'parse_error', 'other')),
  "error_message"     TEXT,
  "attempts"          INTEGER NOT NULL,
  "latency_ms"        INTEGER NOT NULL,
  "cost_usd"          NUMERIC(10, 6) NOT NULL DEFAULT 0,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "engine_call_failures_audit_idx"
  ON "engine_call_failures" ("audit_id");
CREATE INDEX IF NOT EXISTS "engine_call_failures_org_idx"
  ON "engine_call_failures" ("organization_id");

ALTER TABLE "engine_call_failures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "engine_call_failures" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "engine_call_failures_org_select" ON "engine_call_failures";
CREATE POLICY "engine_call_failures_org_select" ON "engine_call_failures" FOR SELECT
  USING ("organization_id" = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS "engine_call_failures_org_insert" ON "engine_call_failures";
CREATE POLICY "engine_call_failures_org_insert" ON "engine_call_failures" FOR INSERT
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS "engine_call_failures_org_update" ON "engine_call_failures";
CREATE POLICY "engine_call_failures_org_update" ON "engine_call_failures" FOR UPDATE
  USING      ("organization_id" = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS "engine_call_failures_org_delete" ON "engine_call_failures";
CREATE POLICY "engine_call_failures_org_delete" ON "engine_call_failures" FOR DELETE
  USING ("organization_id" = current_setting('app.current_org_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "engine_call_failures" TO visibleau_app;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'engine_call_failures'
  ) AS table_present,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'engine_call_failures') AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'engine_call_failures') AS rls_forced,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'engine_call_failures') AS policy_count,
  (
    SELECT count(DISTINCT privilege_type) = 4
    FROM information_schema.role_table_grants
    WHERE table_name = 'engine_call_failures'
      AND grantee = 'visibleau_app'
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) AS app_role_has_all_four_privileges;
