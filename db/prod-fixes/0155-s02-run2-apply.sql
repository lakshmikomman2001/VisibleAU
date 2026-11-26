-- 0155-s02-run2-apply.sql (26 Nov 2026, sprint S02 parts 1-2): migration 0155 and its backfill.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Run after run1 showed every expected result, BEFORE the push. One transaction: all of it or none of it.
-- Needs a role that bypasses RLS (the new tables force it, and the backfill writes every workspace's rows): the first
-- statement stops the run otherwise. Idempotent: a rerun creates nothing new and skips every brand that has a set.
--
-- 1. The schema: db/migrations/0155_question_library.sql, verbatim (tests/unit/questions/run-set-matches-migration.test.ts
--    keeps the two identical).
-- 2. The backfill (LLD 7A steps 1-2): every non-deleted brand's stored question pack (brands.prompt_pack, outside the
--    free sample's workspace) becomes its library -- one row per question, in stored order, source 'original', reach
--    'local', status 'ready', kind by the SQL form of isBrandedPrompt -- and its question set version 1 (current), with
--    the items in stored order and comparison_hash by the audits' own algorithm. Then run3.

BEGIN;

DO $$ BEGIN
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION '0155 run2: % does not bypass RLS; run it as the role run1 check 2 showed bypass_rls t', current_user;
  END IF;
END $$;

-- ==== 0155 SCHEMA (begin) ====
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
-- ==== 0155 SCHEMA (end) ====

-- ==== BACKFILL (begin) ====
-- LLD 7A steps 1-2. Idempotent: a brand that already has a set is skipped, so a rerun writes nothing new.
-- The rule for a question that names the business: the same two functions as run1 (lib/audit/flag-branded-prompts.ts
-- isBrandedPrompt in SQL: the name pattern, each alias, then the domain stem).
CREATE OR REPLACE FUNCTION pg_temp.s02_name_matches(prompt_text text, brand_name text)
RETURNS boolean AS $$
DECLARE
  words text[];
  escaped_words text[];
  w text;
  body text;
  pattern text;
BEGIN
  IF brand_name IS NULL OR btrim(brand_name) = '' THEN
    RETURN false;
  END IF;
  words := string_to_array(btrim(regexp_replace(brand_name, '\s+', ' ', 'g')), ' ');
  escaped_words := ARRAY[]::text[];
  FOREACH w IN ARRAY words LOOP
    IF lower(w) = 'and' THEN
      escaped_words := array_append(escaped_words, '(?:and|&)');
    ELSE
      escaped_words := array_append(
        escaped_words,
        regexp_replace(w, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g')
      );
    END IF;
  END LOOP;
  body := array_to_string(escaped_words, '[\s\-–—&''’.]*');
  pattern := '(?:^|[^[:alnum:]])' || body || '(?:[''’]s?)?(?:$|[^[:alnum:]])';
  RETURN prompt_text ~* pattern;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.s02_is_branded(prompt_text text, brand_name text, brand_domain text, brand_aliases text[])
RETURNS boolean AS $$
DECLARE
  a text;
  stem text;
BEGIN
  IF pg_temp.s02_name_matches(prompt_text, brand_name) THEN
    RETURN true;
  END IF;
  FOREACH a IN ARRAY coalesce(brand_aliases, ARRAY[]::text[]) LOOP
    IF pg_temp.s02_name_matches(prompt_text, a) THEN
      RETURN true;
    END IF;
  END LOOP;
  stem := lower(regexp_replace(regexp_replace(lower(btrim(brand_domain)), '^https?://', ''), '[^a-z0-9.]', '', 'g'));
  stem := regexp_replace(stem, '\.(com\.au|net\.au|org\.au|com|net|org|io|co)+$', '');
  stem := regexp_replace(stem, '[^a-z0-9]', '', 'g');
  IF length(stem) < 4 THEN
    RETURN false;
  END IF;
  RETURN regexp_replace(lower(prompt_text), '[^a-z0-9]', '', 'g') LIKE '%' || stem || '%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- The packs to take: not deleted, not the free sample's workspace, a stored pack of text, no set yet.
CREATE TEMP TABLE s02_backfill ON COMMIT DROP AS
SELECT b.id AS brand_id, b.organization_id, p.text, (p.ord - 1)::int AS position,
       CASE WHEN pg_temp.s02_is_branded(p.text, b.name, b.domain, b.aliases) THEN 'branded' ELSE 'everyday' END AS kind
FROM brands b
CROSS JOIN LATERAL jsonb_array_elements_text(b.prompt_pack) WITH ORDINALITY AS p(text, ord)
WHERE b.deleted_at IS NULL
  AND jsonb_typeof(b.prompt_pack) = 'array'
  AND b.organization_id NOT IN (SELECT id FROM organizations WHERE slug = '__sample__')
  AND NOT EXISTS (SELECT 1 FROM brand_question_sets s WHERE s.brand_id = b.id);

-- Step 1: the library, one row per pack question, in stored order (source original, reach local, ready).
INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source, reach, status)
SELECT organization_id, brand_id, text, question_text_key(text), kind, 'original', 'local', 'ready'
FROM s02_backfill
ORDER BY brand_id, position
ON CONFLICT (brand_id, text_key) WHERE archived_at IS NULL DO NOTHING;

-- Step 2: set version 1, current, its comparison_hash in SQL by the audits' own algorithm (question-set-sql.ts), ...
INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash, note)
SELECT e.organization_id, e.brand_id, 1, true,
       encode(sha256(convert_to(string_agg(e.k, E'\n' ORDER BY e.k COLLATE "C"), 'UTF8')), 'hex'),
       '0155 backfill: the stored question pack'
FROM (SELECT DISTINCT organization_id, brand_id, question_text_key(text) AS k FROM s02_backfill WHERE kind = 'everyday') e
GROUP BY e.organization_id, e.brand_id;

-- ... and its items, in stored order.
INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
SELECT s.id, s.organization_id, q.id, f.position, q.kind, q.reach, q.source
FROM s02_backfill f
JOIN brand_question_sets s ON s.brand_id = f.brand_id AND s.version = 1 AND s.note = '0155 backfill: the stored question pack'
JOIN brand_questions q ON q.brand_id = f.brand_id AND q.text_key = question_text_key(f.text) AND q.archived_at IS NULL;
-- ==== BACKFILL (end) ====

COMMIT;
