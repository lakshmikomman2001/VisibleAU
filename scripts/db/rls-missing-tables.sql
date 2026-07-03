-- VisibleAU RLS Policies — Missing tenant-scoped tables
-- Idempotent: safe to re-run (DROP IF EXISTS before each CREATE POLICY)
--
-- STEP 1 audit found 14 tenant-scoped tables with NO RLS policy:
--   13 (O) tables with organization_id → direct-org policy
--    1 (B) table  with brand_id only   → brand-join policy
--
-- Excluded (correctly no RLS):
--   Global/seed: vertical_packs, vertical_pack_prompts, citability_methods,
--     validation_corpus_results, canary_prompts, recommendation_research,
--     config_bundle_cache, market_ai_budget_policies, metric_quality_gates,
--     processed_webhook_events, prompt_pack_coverage, provider_market_capabilities,
--     sampling_policies
--   Auth framework: auth_accounts, auth_invitations, auth_members,
--     auth_organizations, auth_sessions, auth_users, auth_verifications
--   Flagged: llm_response_cache (RLS ON, no scoping column — no policy possible)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (O) Tables with organization_id — direct org policy
-- Pattern: organization_id::text = current_setting('app.current_org_id', true)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. action_items
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON action_items;
CREATE POLICY "org_isolation" ON action_items
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 2. agency_brand_assets
ALTER TABLE agency_brand_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON agency_brand_assets;
CREATE POLICY "org_isolation" ON agency_brand_assets
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 3. audit_exports
ALTER TABLE audit_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON audit_exports;
CREATE POLICY "org_isolation" ON audit_exports
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 4. audit_schedules
ALTER TABLE audit_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON audit_schedules;
CREATE POLICY "org_isolation" ON audit_schedules
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 5. bulk_operations
ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON bulk_operations;
CREATE POLICY "org_isolation" ON bulk_operations
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 6. client_portal_invites
ALTER TABLE client_portal_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON client_portal_invites;
CREATE POLICY "org_isolation" ON client_portal_invites
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 7. client_portal_views
ALTER TABLE client_portal_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON client_portal_views;
CREATE POLICY "org_isolation" ON client_portal_views
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 8. drift_alerts
ALTER TABLE drift_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON drift_alerts;
CREATE POLICY "org_isolation" ON drift_alerts
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 9. local_seo_results
ALTER TABLE local_seo_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON local_seo_results;
CREATE POLICY "org_isolation" ON local_seo_results
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 10. notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON notification_preferences;
CREATE POLICY "org_isolation" ON notification_preferences
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 11. technical_audits (RLS already ON, just needs policy)
DROP POLICY IF EXISTS "org_isolation" ON technical_audits;
CREATE POLICY "org_isolation" ON technical_audits
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 12. webhook_deliveries
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON webhook_deliveries;
CREATE POLICY "org_isolation" ON webhook_deliveries
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 13. webhook_endpoints
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON webhook_endpoints;
CREATE POLICY "org_isolation" ON webhook_endpoints
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- (B) Tables with brand_id only (no organization_id) — brand→org JOIN policy
-- Pattern: brand_id IN (SELECT id FROM brands WHERE organization_id::text = ...)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 14. brand_entity_scores (RLS already ON, just needs policy)
DROP POLICY IF EXISTS "org_isolation" ON brand_entity_scores;
CREATE POLICY "org_isolation" ON brand_entity_scores
  FOR ALL
  USING (
    brand_id IN (
      SELECT id FROM brands
      WHERE organization_id = current_setting('app.current_org_id', true)::uuid
    )
  )
  WITH CHECK (
    brand_id IN (
      SELECT id FROM brands
      WHERE organization_id = current_setting('app.current_org_id', true)::uuid
    )
  );

COMMIT;
