-- Migration 0155, the question library and versioned question sets (26 Nov 2026, S02 part 1; LLD 7.1, 7A, 8.2).
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0155 run1 -> run2 -> run3; run4 only to undo). The pushed code reads
-- the new tables when an audit starts and writes audits.question_set_id, citations.question_id and
-- engine_call_failures.question_id: without them every audit fails. Drizzle reads every schema column, so every audit,
-- citation and failure read fails too.
--
-- New organisation tables (FORCE RLS on app.current_org_id, as 0145's and 0154's loop; visibleau_app DML like every
-- table):
-- - brand_questions: a brand's library -- every question it has asked or could ask, each with its compared text
--   (text_key = question_text_key(text), migration 0152, held by a CHECK), kind (everyday / branded), source, reach,
--   status. A question used by a set is never deleted ("delete" archives it); a changed wording is a new row, so an
--   answer stays tied to the exact words asked. One live row per brand and compared text.
-- - brand_question_sets: the brand's versioned sets; exactly one is current. comparison_hash is the same algorithm as
--   audits.question_set_hash (lib/audit/question-set-sql.ts, lib/questions/hash.ts).
-- - brand_question_set_items: a set's questions in order, with each one's kind, reach and source when applied.
-- New nullable columns (NULL on every row before this): audits.question_set_id, citations.question_id,
-- engine_call_failures.question_id.
--
-- Reference rules: a set item's question reference is checked at commit (NO ACTION, DEFERRABLE INITIALLY DEFERRED)
-- rather than at once (the LLD's RESTRICT): deleting a brand cascades to its questions and to its sets' items in one
-- statement, and Postgres can reach the questions first, so an immediate check refuses the brand's own delete (seen in
-- the S02 schema test). A question a set uses still can't be deleted on its own: the commit refuses it. An audit's set
-- reference is SET NULL, so removing a set (run4) never fails on the audits that used it.
--
-- Additive only. Idempotent. No backfill here: 0155's run2 adds it (S02 part 2).

-- ==== Organisation tables ====
CREATE TABLE IF NOT EXISTS "brand_questions" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"     UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "brand_id"            UUID NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "text"                TEXT NOT NULL CHECK (char_length("text") BETWEEN 10 AND 200),
  "text_key"            TEXT NOT NULL,
  "kind"                TEXT NOT NULL CHECK ("kind" IN ('everyday', 'branded')),
  "source"              TEXT NOT NULL CHECK ("source" IN ('original', 'template', 'ai_suggested', 'agency')),
  "reach"               TEXT NOT NULL DEFAULT 'local' CHECK ("reach" IN ('local', 'state', 'country', 'global')),
  "service_label"       TEXT,
  "business_service_id" UUID,
  "place_label"         TEXT,
  "intent"              TEXT CHECK ("intent" IN ('best', 'reviews', 'price', 'near', 'problem', 'emergency', 'comparison', 'other')),
  "status"              TEXT NOT NULL DEFAULT 'ready' CHECK ("status" IN ('suggested', 'ready', 'archived')),
  "rank"                NUMERIC(6, 3),
  "reasons"             JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_by"          UUID REFERENCES "users"("id"),
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "archived_at"         TIMESTAMPTZ
);
DO $$ BEGIN
  ALTER TABLE "brand_questions" ADD CONSTRAINT "brand_questions_text_key_check"
    CHECK ("text_key" = question_text_key("text"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "brand_questions_live_key" ON "brand_questions" ("brand_id", "text_key")
  WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "brand_questions_brand_status" ON "brand_questions" ("organization_id", "brand_id", "status");

CREATE TABLE IF NOT EXISTS "brand_question_sets" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "brand_id"        UUID NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "version"         INTEGER NOT NULL CHECK ("version" >= 1),
  "is_current"      BOOLEAN NOT NULL DEFAULT false,
  "comparison_hash" TEXT NOT NULL,
  "reach_hashes"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "applied_by"      UUID REFERENCES "users"("id"),
  "applied_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "note"            TEXT,
  UNIQUE ("brand_id", "version")
);
CREATE UNIQUE INDEX IF NOT EXISTS "brand_question_sets_one_current" ON "brand_question_sets" ("brand_id")
  WHERE "is_current";

CREATE TABLE IF NOT EXISTS "brand_question_set_items" (
  "set_id"          UUID NOT NULL REFERENCES "brand_question_sets"("id") ON DELETE CASCADE,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "question_id"     UUID NOT NULL REFERENCES "brand_questions"("id") DEFERRABLE INITIALLY DEFERRED,
  "position"        INTEGER NOT NULL CHECK ("position" >= 0),
  "kind"            TEXT NOT NULL CHECK ("kind" IN ('everyday', 'branded')),
  "reach"           TEXT NOT NULL CHECK ("reach" IN ('local', 'state', 'country', 'global')),
  "source"          TEXT NOT NULL CHECK ("source" IN ('original', 'template', 'ai_suggested', 'agency')),
  PRIMARY KEY ("set_id", "question_id"),
  UNIQUE ("set_id", "position")
);
CREATE INDEX IF NOT EXISTS "brand_question_set_items_question" ON "brand_question_set_items" ("question_id");
-- A database that created the table before the reference was deferred (local ones during S02) gets it here.
ALTER TABLE "brand_question_set_items"
  ALTER CONSTRAINT "brand_question_set_items_question_id_fkey" DEFERRABLE INITIALLY DEFERRED;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_questions', 'brand_question_sets', 'brand_question_set_items'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_questions", "brand_question_sets", "brand_question_set_items"
TO visibleau_app;

-- ==== Which set an audit asked, and which question each answer and failure answered ====
ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "question_set_id" UUID;
DO $$ BEGIN
  ALTER TABLE "audits" ADD CONSTRAINT "audits_question_set_id_fkey"
    FOREIGN KEY ("question_set_id") REFERENCES "brand_question_sets"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "citations" ADD COLUMN IF NOT EXISTS "question_id" UUID;
DO $$ BEGIN
  ALTER TABLE "citations" ADD CONSTRAINT "citations_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "brand_questions"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "citations_question" ON "citations" ("question_id") WHERE "question_id" IS NOT NULL;

ALTER TABLE "engine_call_failures" ADD COLUMN IF NOT EXISTS "question_id" UUID;
DO $$ BEGIN
  ALTER TABLE "engine_call_failures" ADD CONSTRAINT "engine_call_failures_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "brand_questions"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "engine_call_failures_question" ON "engine_call_failures" ("question_id")
  WHERE "question_id" IS NOT NULL;
