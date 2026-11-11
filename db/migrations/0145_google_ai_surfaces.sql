-- Migration 0145 (Vunnara, 11 Nov; Google AI surfaces, Phase 1, part 1): the switches for Google AI Overviews
-- and Google AI Mode, and the tables their results go in.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0145 run1 -> run3; run4 only to undo, and only before any
-- Google result is recorded).
--
-- Additive only (Sri, 1 Nov: turning Google on or off must not touch any existing feature). Five new tables;
-- no existing table, column, constraint, index, policy or grant changes. Nothing reads them until the env
-- switch GOOGLE_AI_SURFACES_ENABLED is "true", and a missing row means "off" or the default.
--
-- - feature_settings: global, operator-only settings (one row per key; no row = the default in
--   lib/governance/google-surfaces.ts). No workspace column, so no RLS (like config_bundle_cache).
-- - feature_setting_changes: who changed which setting or workspace override, from what to what, and when
--   (the admin page's history; a workspace override is also written to that workspace's audit_trail). Global.
-- - brand_google_locations: the postcode an operator sets for a brand (brands have no postcode column);
--   lib/google-surfaces/location.ts resolves it to the provider's location. Workspace-scoped, FORCE RLS.
-- - audit_google_surfaces: what one audit ran with (surfaces, settings, location) and how its Google
--   collection ended, decided once at the audit's start. Workspace-scoped, FORCE RLS.
-- - google_surface_results: one row per (audit, surface, question). Its own table, never citations or
--   engine_call_failures, so no existing count, headline, failure line or comparison can see a Google row.
--   Workspace-scoped, FORCE RLS; deleted with its audit (12-month retention, lib/retention/audit-retention.ts).
--
-- Idempotent.

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
