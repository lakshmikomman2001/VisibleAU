-- Migration 0157, visibility reach: where each brand wants to be visible, and each audit's figures per reach
-- (27 Nov 2026, S04 part 2; LLD 7.2, 7A, 8.4).
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0157 run1 -> run2 -> run3; run4 only to undo). The pushed code reads
-- and writes both tables.
--
-- - brand_visibility_scopes: a brand's reaches -- 'local', 'state', 'country', 'global' (the customer's word for global
--   is "Worldwide") -- one row each at most; whether it's on, its place (local: suburb, city, state, postcode; state:
--   the state; country: the country; global: nothing) and how many everyday questions it gets. Local is on for every
--   brand: run2's backfill writes one local row per brand from its own location, and the app reads a brand with no
--   row as Local only, as today.
-- - audit_reach_results: an audit's Visibility in each reach it asked -- successful everyday answers, mentions, the
--   95% Wilson interval (as fractions) and the reach's question hash, so a reach is only ever compared with the same
--   reach asked with the same questions. Written when an audit completes; run2 backfills a local row for every past
--   complete audit from the figures its headline shows.
--
-- Both are organisation tables: FORCE RLS on app.current_org_id, as 0145's, 0155's and 0156's loop; visibleau_app DML
-- like every table. A brand's reaches go with the brand; an audit's results go with the audit.
--
-- Additive only. Idempotent. The backfill is run2's own step (not part of this file).

-- ==== A brand's reaches (organisation table) ====
CREATE TABLE IF NOT EXISTS "brand_visibility_scopes" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"  UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "brand_id"         UUID NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "reach"            TEXT NOT NULL CHECK ("reach" IN ('local', 'state', 'country', 'global')),
  "enabled"          BOOLEAN NOT NULL DEFAULT true,
  "place"            JSONB NOT NULL DEFAULT '{}'::jsonb,
  "target_count"     INTEGER NOT NULL DEFAULT 0 CHECK ("target_count" BETWEEN 0 AND 60),
  "updated_by"       UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "brand_visibility_scopes_brand_reach_key" UNIQUE ("brand_id", "reach")
);
CREATE INDEX IF NOT EXISTS "brand_visibility_scopes_org" ON "brand_visibility_scopes" ("organization_id");

-- ==== An audit's figures per reach (organisation table) ====
CREATE TABLE IF NOT EXISTS "audit_reach_results" (
  "audit_id"          UUID NOT NULL REFERENCES "audits"("id") ON DELETE CASCADE,
  "organization_id"   UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "reach"             TEXT NOT NULL CHECK ("reach" IN ('local', 'state', 'country', 'global')),
  "everyday_answers"  INTEGER NOT NULL CHECK ("everyday_answers" >= 0),
  "mentioned"         INTEGER NOT NULL CHECK ("mentioned" >= 0 AND "mentioned" <= "everyday_answers"),
  "ci_low"            NUMERIC(5, 4),
  "ci_high"           NUMERIC(5, 4),
  "reach_hash"        TEXT NOT NULL,
  PRIMARY KEY ("audit_id", "reach")
);
CREATE INDEX IF NOT EXISTS "audit_reach_results_org" ON "audit_reach_results" ("organization_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_visibility_scopes', 'audit_reach_results'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_visibility_scopes" TO visibleau_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_reach_results" TO visibleau_app;
