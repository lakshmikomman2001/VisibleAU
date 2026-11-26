-- 0156-s03-run2-apply.sql (27 Nov 2026, sprint S03 part 1): applies migration 0156 (question packs). After run1.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri runs it; NOT run from Claude Code. One transaction: the migration, verbatim (a test holds it equal to
-- db/migrations/0156_question_packs.sql), then one summary SELECT of what it wrote, just before COMMIT (LLD amendment
-- 80: Neon's editor shows at most 25 result tabs, and this is the only one).

BEGIN;

-- ==== 0156 SCHEMA (begin) ====
-- Migration 0156, question packs: the workspace's bought packs and each brand's share (27 Nov 2026, S03 part 1;
-- LLD 7.6, 7A, 8.3.5, 8.7).
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0156 run1 -> run2 -> run3; run4 only to undo). Drizzle reads every
-- schema column, so the pushed code's every read of organizations fails without organizations.question_packs.
--
-- - organizations.question_packs: how many question packs the workspace has (each adds 10 everyday questions per brand
--   it's assigned to). Written by the Stripe webhook from S10; 0 on every row until then, and 0 changes nothing.
-- - brand_question_packs: how many of those packs a brand uses (S10). An organisation table: FORCE RLS on
--   app.current_org_id, as 0145's, 0154's and 0155's loop; visibleau_app DML like every table. A brand's row goes with
--   the brand. The assignment write (S10) locks the organization row and keeps sum(packs) <= question_packs.
--
-- Additive only. Idempotent. No backfill: the default is the value.

-- ==== The workspace's packs ====
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "question_packs" INTEGER NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_question_packs_check" CHECK ("question_packs" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==== Each brand's share (organisation table) ====
CREATE TABLE IF NOT EXISTS "brand_question_packs" (
  "brand_id"         UUID PRIMARY KEY REFERENCES "brands"("id") ON DELETE CASCADE,
  "organization_id"  UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "packs"            INTEGER NOT NULL CHECK ("packs" >= 0),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "brand_question_packs_org" ON "brand_question_packs" ("organization_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_question_packs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING ("organization_id" = current_setting(''app.current_org_id'', true)::uuid)', t || '_org_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK ("organization_id" = current_setting(''app.current_org_id'', true)::uuid)', t || '_org_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING ("organization_id" = current_setting(''app.current_org_id'', true)::uuid) WITH CHECK ("organization_id" = current_setting(''app.current_org_id'', true)::uuid)', t || '_org_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING ("organization_id" = current_setting(''app.current_org_id'', true)::uuid)', t || '_org_delete', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_question_packs" TO visibleau_app;
-- ==== 0156 SCHEMA (end) ====

-- What run2 wrote: the one result. Expected: workspaces = run1's check 3, workspaces_at_0 = workspaces,
-- packs_rows 0, packs_policies 4, packs_forced t.
SELECT
  (SELECT count(*) FROM organizations) AS workspaces,
  (SELECT count(*) FROM organizations WHERE question_packs = 0) AS workspaces_at_0,
  (SELECT count(*) FROM brand_question_packs) AS packs_rows,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'brand_question_packs') AS packs_policies,
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.brand_question_packs'::regclass) AS packs_forced;

COMMIT;
