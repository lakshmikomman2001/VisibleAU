-- 0154-s01-run2-apply.sql (23 Nov 2026, sprint S01 part 2): migration 0154. The same statements as
-- db/migrations/0154_report_v2.sql, in one transaction.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES. Sri runs it after run1, BEFORE the push. Take a pg_dump of generated_reports, report_delivery_schedules,
-- agency_brand_assets and brands first (CLAUDE.md: production changes need a backup).
--
-- Additive: three new tables (FORCE RLS), five new columns with defaults, one CHECK function. Existing reports and
-- schedules become 'basic' (today's report); nothing else in an existing row changes.
BEGIN;

-- ==== Organisation tables ====
CREATE TABLE IF NOT EXISTS "report_brand_preferences" (
  "brand_id"                UUID PRIMARY KEY REFERENCES "brands"("id") ON DELETE CASCADE,
  "organization_id"         UUID NOT NULL REFERENCES "organizations"("id"),
  "include_general_advice"  BOOLEAN NOT NULL DEFAULT true,
  "include_done_since_last" BOOLEAN NOT NULL DEFAULT true,
  "default_tier"            TEXT CHECK ("default_tier" IN ('basic', 'standard', 'enhanced')),
  "updated_by"              UUID REFERENCES "users"("id"),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "report_action_choices" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id"),
  "brand_id"        UUID NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "action_item_id"  UUID NOT NULL REFERENCES "action_items"("id") ON DELETE CASCADE,
  "included"        BOOLEAN NOT NULL DEFAULT true,
  "position"        INTEGER,
  "note"            TEXT CHECK (char_length("note") <= 400),
  "updated_by"      UUID REFERENCES "users"("id"),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("brand_id", "action_item_id")
);
CREATE INDEX IF NOT EXISTS "report_action_choices_action_item_idx" ON "report_action_choices" ("action_item_id");

CREATE TABLE IF NOT EXISTS "agency_actions" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id"),
  "brand_id"        UUID NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "title"           TEXT NOT NULL CHECK (char_length("title") BETWEEN 5 AND 120),
  "detail"          TEXT CHECK (char_length("detail") <= 600),
  "priority"        TEXT NOT NULL CHECK ("priority" IN ('high', 'medium', 'low')),
  "status"          TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'in_progress', 'done')),
  "position"        INTEGER,
  "created_by"      UUID REFERENCES "users"("id"),
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "archived_at"     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "agency_actions_brand_open_idx" ON "agency_actions" ("brand_id") WHERE "archived_at" IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['report_brand_preferences', 'report_action_choices', 'agency_actions'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "report_brand_preferences", "report_action_choices", "agency_actions"
TO visibleau_app;

-- ==== Report tier on generated reports and schedules ====
ALTER TABLE "generated_reports" ADD COLUMN IF NOT EXISTS "contents_snapshot" JSONB;
ALTER TABLE "generated_reports" ADD COLUMN IF NOT EXISTS "report_tier" TEXT NOT NULL DEFAULT 'basic';
DO $$ BEGIN
  ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_report_tier_check"
    CHECK ("report_tier" IN ('basic', 'standard', 'enhanced'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "report_delivery_schedules" ADD COLUMN IF NOT EXISTS "report_tier" TEXT NOT NULL DEFAULT 'basic';
DO $$ BEGIN
  ALTER TABLE "report_delivery_schedules" ADD CONSTRAINT "report_delivery_schedules_report_tier_check"
    CHECK ("report_tier" IN ('basic', 'standard', 'enhanced'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==== Tier names on the workspace's report branding (LLD 7.5, P18) ====
-- Each name 1-24 characters after trimming, a string with no control characters (no line breaks), the three unique
-- ignoring case; only the keys basic, standard, enhanced; a missing key falls back to the default name. The API
-- checks the same rules with zod (lib/reports/tier-names.ts); this is the floor.
CREATE OR REPLACE FUNCTION "report_tier_names_ok"(names JSONB) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT names IS NULL OR (
    jsonb_typeof(names) = 'object'
    AND (names - 'basic' - 'standard' - 'enhanced') = '{}'::jsonb
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(names) AS e(k, v)
      WHERE jsonb_typeof(v) <> 'string'
         OR char_length(btrim(v #>> '{}')) NOT BETWEEN 1 AND 24
         OR (v #>> '{}') ~ '[[:cntrl:]]'
    )
    AND (SELECT count(*) FROM jsonb_each_text(names)) =
        (SELECT count(DISTINCT lower(btrim(value))) FROM jsonb_each_text(names))
  )
$$;

ALTER TABLE "agency_brand_assets" ADD COLUMN IF NOT EXISTS "report_tier_names" JSONB;
DO $$ BEGIN
  ALTER TABLE "agency_brand_assets" ADD CONSTRAINT "agency_brand_assets_report_tier_names_check"
    CHECK ("report_tier_names_ok"("report_tier_names"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "agency_brand_assets" ADD CONSTRAINT "agency_brand_assets_report_tier_names_workspace_only"
    CHECK ("report_tier_names" IS NULL OR "brand_id" IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==== ABN suggestion (LLD 7.7, 8.8.6) ====
-- {"abn":"17701710947","entity":"Astorio Group Pty Ltd","postcode":"2765","state":"NSW","status":"Active",
--  "checked_at":"...", "answer": null | "dismissed"}: the ABR match brand settings offers while brands.abn is empty;
-- "Not mine" keeps it with answer "dismissed", so it's never offered again for this brand.
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "abn_suggestion" JSONB;

COMMIT;
