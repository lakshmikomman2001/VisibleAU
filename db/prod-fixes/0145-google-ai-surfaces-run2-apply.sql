-- 0145-google-ai-surfaces-run2-apply.sql (Google AI surfaces, Phase 1, part 1): creates the five tables for
-- the Google AI Overviews / AI Mode switches and results. The DDL between BEGIN and COMMIT is
-- db/migrations/0145_google_ai_surfaces.sql's, word for word.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri-authorized only. NOT run from Claude Code. Run on its own, as one editor submission, after run1.
--
-- Additive only: new tables, their indexes, FORCE RLS and four policies on the three workspace tables,
-- and grants to visibleau_app. No existing object changes. Idempotent (IF NOT EXISTS / DROP POLICY IF
-- EXISTS), so a second run changes nothing.
--
-- Expected: COMMIT, then the check below reads t for every column.

BEGIN;

CREATE TABLE IF NOT EXISTS "feature_settings" (
  "key"                TEXT PRIMARY KEY CHECK ("key" IN (
                          'google_ai_overviews_enabled',
                          'google_ai_mode_enabled',
                          'google_surfaces_count_in_headline',
                          'google_surfaces_queue_mode',
                          'google_surfaces_device',
                          'google_surfaces_max_cost_usd_per_audit')),
  "value"              JSONB NOT NULL,
  "updated_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "feature_setting_changes" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope"               TEXT NOT NULL CHECK ("scope" IN ('global', 'workspace', 'brand')),
  "setting_key"         TEXT NOT NULL,
  "target_workspace_id" UUID REFERENCES "organizations"("id") ON DELETE SET NULL,
  "target_brand_id"     UUID REFERENCES "brands"("id") ON DELETE SET NULL,
  "old_value"           JSONB,
  "new_value"           JSONB,
  "changed_by_user_id"  UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "feature_setting_changes_created_idx"
  ON "feature_setting_changes" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "brand_google_locations" (
  "brand_id"           UUID PRIMARY KEY REFERENCES "brands"("id") ON DELETE CASCADE,
  "organization_id"    UUID NOT NULL REFERENCES "organizations"("id"),
  "postcode"           TEXT NOT NULL CHECK ("postcode" ~ '^[0-9]{4}$'),
  "updated_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "brand_google_locations_org_idx"
  ON "brand_google_locations" ("organization_id");

CREATE TABLE IF NOT EXISTS "audit_google_surfaces" (
  "audit_id"        UUID PRIMARY KEY REFERENCES "audits"("id") ON DELETE CASCADE,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id"),
  "surfaces"        TEXT[] NOT NULL,
  "settings"        JSONB NOT NULL,
  "location"        JSONB,
  "status"          TEXT NOT NULL CHECK ("status" IN ('queued', 'collecting', 'complete')),
  "status_reason"   TEXT,
  "cost_usd"        NUMERIC(10, 6),
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at"    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "audit_google_surfaces_org_idx"
  ON "audit_google_surfaces" ("organization_id");

CREATE TABLE IF NOT EXISTS "google_surface_results" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "audit_id"             UUID NOT NULL REFERENCES "audits"("id") ON DELETE CASCADE,
  "organization_id"      UUID NOT NULL REFERENCES "organizations"("id"),
  "surface"              TEXT NOT NULL CHECK ("surface" IN ('google_ai_overviews', 'google_ai_mode')),
  "prompt"               TEXT NOT NULL,
  "prompt_index"         INTEGER NOT NULL,
  "is_branded_prompt"    BOOLEAN NOT NULL,
  "outcome"              TEXT NOT NULL CHECK ("outcome" IN
                            ('pending', 'shown', 'not_shown', 'failed', 'not_completed', 'skipped')),
  "outcome_reason"       TEXT,
  "provider"             TEXT NOT NULL,
  "provider_task_id"     TEXT,
  "provider_status_code" INTEGER,
  "attempts"             INTEGER NOT NULL DEFAULT 0,
  "answer_text"          TEXT,
  "cited_links"          JSONB,
  "google_link_count"    INTEGER,
  "brand_mentioned"      BOOLEAN,
  "mention_verification" TEXT CHECK ("mention_verification" IN
                            ('verified_domain', 'verified_location', 'unverified')),
  "position"             INTEGER,
  "cost_usd"             NUMERIC(10, 6),
  "cost_source"          TEXT,
  "location_code"        INTEGER,
  "location_label"       TEXT,
  "device"               TEXT,
  "se_domain"            TEXT,
  "language_code"        TEXT,
  "queue_mode"           TEXT,
  "fetched_at"           TIMESTAMPTZ,
  "raw_response"         JSONB,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_surface_results_audit_surface_prompt_idx"
  ON "google_surface_results" ("audit_id", "surface", "prompt_index");
CREATE INDEX IF NOT EXISTS "google_surface_results_org_idx"
  ON "google_surface_results" ("organization_id");

-- Workspace-scoped tables: FORCE RLS and four policies on organization_id (migration 0089's pattern).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_google_locations', 'audit_google_surfaces', 'google_surface_results'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "feature_settings", "feature_setting_changes", "brand_google_locations", "audit_google_surfaces",
  "google_surface_results"
TO visibleau_app;

COMMIT;

-- Check. Expected: every column t.
SELECT
  to_regclass('public.feature_settings') IS NOT NULL        AS feature_settings,
  to_regclass('public.feature_setting_changes') IS NOT NULL AS feature_setting_changes,
  to_regclass('public.brand_google_locations') IS NOT NULL  AS brand_google_locations,
  to_regclass('public.audit_google_surfaces') IS NOT NULL   AS audit_google_surfaces,
  to_regclass('public.google_surface_results') IS NOT NULL  AS google_surface_results,
  (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class
     WHERE relname IN ('brand_google_locations', 'audit_google_surfaces', 'google_surface_results'))
                                                            AS workspace_tables_force_rls,
  (SELECT count(*) = 12 FROM pg_policies
     WHERE tablename IN ('brand_google_locations', 'audit_google_surfaces', 'google_surface_results'))
                                                            AS twelve_policies,
  (SELECT count(DISTINCT table_name) = 5 FROM information_schema.role_table_grants
     WHERE grantee = 'visibleau_app' AND privilege_type = 'DELETE'
       AND table_name IN ('feature_settings', 'feature_setting_changes', 'brand_google_locations',
                          'audit_google_surfaces', 'google_surface_results'))
                                                            AS app_role_granted;
