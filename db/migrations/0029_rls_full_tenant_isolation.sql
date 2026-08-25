-- 0029_rls_full_tenant_isolation.sql
-- Full Row-Level Security for multi-tenant isolation.
-- Covers all org-scoped tables (direct + join-scoped + self-scoped).
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS before each CREATE).
-- GUC: app.current_org_id (text, cast to uuid). Fail-closed: missing_ok=true
-- returns NULL, which never matches → 0 rows when context is unset.

BEGIN;

-- ============================================================
-- CLEANUP: drop legacy *_org_isolation policies from earlier migrations
-- (0013-0026 used a different naming convention; these are superseded
-- by the 4-operation policies below)
-- ============================================================
DROP POLICY IF EXISTS agent_readiness_scores_org_isolation ON agent_readiness_scores;
DROP POLICY IF EXISTS org_isolation ON audit_trail;
DROP POLICY IF EXISTS org_isolation ON brand_consensus_checks;
DROP POLICY IF EXISTS brand_web_mentions_org_isolation ON brand_web_mentions;
DROP POLICY IF EXISTS org_isolation ON citation_source_intelligence;
DROP POLICY IF EXISTS org_isolation ON comparison_prompt_results;
DROP POLICY IF EXISTS content_structure_audits_org_isolation ON content_structure_audits;
DROP POLICY IF EXISTS org_isolation ON conversation_journeys;
DROP POLICY IF EXISTS crawler_visit_logs_org_isolation ON crawler_visit_logs;
DROP POLICY IF EXISTS org_isolation ON data_residency_log;
DROP POLICY IF EXISTS org_isolation ON evidence_snapshots;
DROP POLICY IF EXISTS org_isolation ON generated_reports;
DROP POLICY IF EXISTS google_ai_mode_results_org_isolation ON google_ai_mode_results;
DROP POLICY IF EXISTS org_isolation ON hallucination_incidents;
DROP POLICY IF EXISTS org_isolation ON journey_run_results;
DROP POLICY IF EXISTS org_isolation ON linkedin_presence_audits;
DROP POLICY IF EXISTS llmstxt_versions_org_isolation ON llmstxt_versions;
DROP POLICY IF EXISTS org_isolation ON org_feature_flags;
DROP POLICY IF EXISTS org_isolation ON org_members;
DROP POLICY IF EXISTS query_fan_out_results_org_isolation ON query_fan_out_results;
DROP POLICY IF EXISTS org_isolation ON report_delivery_schedules;
DROP POLICY IF EXISTS org_isolation ON report_templates;
DROP POLICY IF EXISTS sov_snapshots_org_isolation ON share_of_voice_snapshots;
DROP POLICY IF EXISTS topical_coverage_gaps_org_isolation ON topical_coverage_gaps;
DROP POLICY IF EXISTS visibility_trends_org_isolation ON visibility_trends;
DROP POLICY IF EXISTS org_isolation ON youtube_presence_audits;

-- ============================================================
-- DIRECT-SCOPED TABLES (organization_id = current_org_id)
-- 50 tables
-- ============================================================

-- action_items
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_items_org_select ON action_items;
CREATE POLICY action_items_org_select ON action_items FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS action_items_org_insert ON action_items;
CREATE POLICY action_items_org_insert ON action_items FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS action_items_org_update ON action_items;
CREATE POLICY action_items_org_update ON action_items FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS action_items_org_delete ON action_items;
CREATE POLICY action_items_org_delete ON action_items FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- agency_brand_assets
ALTER TABLE agency_brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_brand_assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agency_brand_assets_org_select ON agency_brand_assets;
CREATE POLICY agency_brand_assets_org_select ON agency_brand_assets FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS agency_brand_assets_org_insert ON agency_brand_assets;
CREATE POLICY agency_brand_assets_org_insert ON agency_brand_assets FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS agency_brand_assets_org_update ON agency_brand_assets;
CREATE POLICY agency_brand_assets_org_update ON agency_brand_assets FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS agency_brand_assets_org_delete ON agency_brand_assets;
CREATE POLICY agency_brand_assets_org_delete ON agency_brand_assets FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- agent_readiness_scores
ALTER TABLE agent_readiness_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_readiness_scores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_readiness_scores_org_select ON agent_readiness_scores;
CREATE POLICY agent_readiness_scores_org_select ON agent_readiness_scores FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS agent_readiness_scores_org_insert ON agent_readiness_scores;
CREATE POLICY agent_readiness_scores_org_insert ON agent_readiness_scores FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS agent_readiness_scores_org_update ON agent_readiness_scores;
CREATE POLICY agent_readiness_scores_org_update ON agent_readiness_scores FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS agent_readiness_scores_org_delete ON agent_readiness_scores;
CREATE POLICY agent_readiness_scores_org_delete ON agent_readiness_scores FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ai_referral_hits
ALTER TABLE ai_referral_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_referral_hits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_referral_hits_org_isolation ON ai_referral_hits;
DROP POLICY IF EXISTS ai_referral_hits_org_select ON ai_referral_hits;
CREATE POLICY ai_referral_hits_org_select ON ai_referral_hits FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS ai_referral_hits_org_insert ON ai_referral_hits;
CREATE POLICY ai_referral_hits_org_insert ON ai_referral_hits FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS ai_referral_hits_org_update ON ai_referral_hits;
CREATE POLICY ai_referral_hits_org_update ON ai_referral_hits FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS ai_referral_hits_org_delete ON ai_referral_hits;
CREATE POLICY ai_referral_hits_org_delete ON ai_referral_hits FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- audit_cost_snapshots
ALTER TABLE audit_cost_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_cost_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_cost_snapshots_org_select ON audit_cost_snapshots;
CREATE POLICY audit_cost_snapshots_org_select ON audit_cost_snapshots FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_cost_snapshots_org_insert ON audit_cost_snapshots;
CREATE POLICY audit_cost_snapshots_org_insert ON audit_cost_snapshots FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_cost_snapshots_org_update ON audit_cost_snapshots;
CREATE POLICY audit_cost_snapshots_org_update ON audit_cost_snapshots FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_cost_snapshots_org_delete ON audit_cost_snapshots;
CREATE POLICY audit_cost_snapshots_org_delete ON audit_cost_snapshots FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- audit_exports
ALTER TABLE audit_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_exports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_exports_org_select ON audit_exports;
CREATE POLICY audit_exports_org_select ON audit_exports FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_exports_org_insert ON audit_exports;
CREATE POLICY audit_exports_org_insert ON audit_exports FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_exports_org_update ON audit_exports;
CREATE POLICY audit_exports_org_update ON audit_exports FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_exports_org_delete ON audit_exports;
CREATE POLICY audit_exports_org_delete ON audit_exports FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- audit_schedules
ALTER TABLE audit_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_schedules_org_select ON audit_schedules;
CREATE POLICY audit_schedules_org_select ON audit_schedules FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_schedules_org_insert ON audit_schedules;
CREATE POLICY audit_schedules_org_insert ON audit_schedules FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_schedules_org_update ON audit_schedules;
CREATE POLICY audit_schedules_org_update ON audit_schedules FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_schedules_org_delete ON audit_schedules;
CREATE POLICY audit_schedules_org_delete ON audit_schedules FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- audit_trail
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_trail_org_select ON audit_trail;
CREATE POLICY audit_trail_org_select ON audit_trail FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_trail_org_insert ON audit_trail;
CREATE POLICY audit_trail_org_insert ON audit_trail FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_trail_org_update ON audit_trail;
CREATE POLICY audit_trail_org_update ON audit_trail FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audit_trail_org_delete ON audit_trail;
CREATE POLICY audit_trail_org_delete ON audit_trail FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- audits
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audits_select ON audits;
DROP POLICY IF EXISTS audits_org_select ON audits;
CREATE POLICY audits_org_select ON audits FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audits_insert ON audits;
DROP POLICY IF EXISTS audits_org_insert ON audits;
CREATE POLICY audits_org_insert ON audits FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audits_update ON audits;
DROP POLICY IF EXISTS audits_org_update ON audits;
CREATE POLICY audits_org_update ON audits FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS audits_delete ON audits;
DROP POLICY IF EXISTS audits_org_delete ON audits;
CREATE POLICY audits_org_delete ON audits FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- auth_invitations (Better Auth org plugin — organization_id is TEXT referencing
-- auth_organizations.id, mapped to our orgs via organizations.clerk_org_id)
ALTER TABLE auth_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_invitations_org_select ON auth_invitations;
CREATE POLICY auth_invitations_org_select ON auth_invitations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_invitations.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS auth_invitations_org_insert ON auth_invitations;
CREATE POLICY auth_invitations_org_insert ON auth_invitations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_invitations.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS auth_invitations_org_update ON auth_invitations;
CREATE POLICY auth_invitations_org_update ON auth_invitations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_invitations.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_invitations.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS auth_invitations_org_delete ON auth_invitations;
CREATE POLICY auth_invitations_org_delete ON auth_invitations FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_invitations.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ));

-- auth_members (Better Auth org plugin — organization_id is TEXT referencing
-- auth_organizations.id, mapped to our orgs via organizations.clerk_org_id)
ALTER TABLE auth_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_members_org_select ON auth_members;
CREATE POLICY auth_members_org_select ON auth_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_members.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS auth_members_org_insert ON auth_members;
CREATE POLICY auth_members_org_insert ON auth_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_members.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS auth_members_org_update ON auth_members;
CREATE POLICY auth_members_org_update ON auth_members FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_members.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_members.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS auth_members_org_delete ON auth_members;
CREATE POLICY auth_members_org_delete ON auth_members FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.clerk_org_id = auth_members.organization_id
      AND o.id = current_setting('app.current_org_id', true)::uuid
  ));

-- brand_consensus_checks
ALTER TABLE brand_consensus_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_consensus_checks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_consensus_checks_org_select ON brand_consensus_checks;
CREATE POLICY brand_consensus_checks_org_select ON brand_consensus_checks FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_consensus_checks_org_insert ON brand_consensus_checks;
CREATE POLICY brand_consensus_checks_org_insert ON brand_consensus_checks FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_consensus_checks_org_update ON brand_consensus_checks;
CREATE POLICY brand_consensus_checks_org_update ON brand_consensus_checks FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_consensus_checks_org_delete ON brand_consensus_checks;
CREATE POLICY brand_consensus_checks_org_delete ON brand_consensus_checks FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- brand_entity_scores
ALTER TABLE brand_entity_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_entity_scores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_entity_scores_org_select ON brand_entity_scores;
CREATE POLICY brand_entity_scores_org_select ON brand_entity_scores FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_entity_scores_org_insert ON brand_entity_scores;
CREATE POLICY brand_entity_scores_org_insert ON brand_entity_scores FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_entity_scores_org_update ON brand_entity_scores;
CREATE POLICY brand_entity_scores_org_update ON brand_entity_scores FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_entity_scores_org_delete ON brand_entity_scores;
CREATE POLICY brand_entity_scores_org_delete ON brand_entity_scores FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- brand_web_mentions
ALTER TABLE brand_web_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_web_mentions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_web_mentions_org_select ON brand_web_mentions;
CREATE POLICY brand_web_mentions_org_select ON brand_web_mentions FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_web_mentions_org_insert ON brand_web_mentions;
CREATE POLICY brand_web_mentions_org_insert ON brand_web_mentions FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_web_mentions_org_update ON brand_web_mentions;
CREATE POLICY brand_web_mentions_org_update ON brand_web_mentions FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brand_web_mentions_org_delete ON brand_web_mentions;
CREATE POLICY brand_web_mentions_org_delete ON brand_web_mentions FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- brands
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brands_select ON brands;
DROP POLICY IF EXISTS brands_org_select ON brands;
CREATE POLICY brands_org_select ON brands FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brands_insert ON brands;
DROP POLICY IF EXISTS brands_org_insert ON brands;
CREATE POLICY brands_org_insert ON brands FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brands_update ON brands;
DROP POLICY IF EXISTS brands_org_update ON brands;
CREATE POLICY brands_org_update ON brands FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS brands_delete ON brands;
DROP POLICY IF EXISTS brands_org_delete ON brands;
CREATE POLICY brands_org_delete ON brands FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- bulk_operations
ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_operations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bulk_operations_org_select ON bulk_operations;
CREATE POLICY bulk_operations_org_select ON bulk_operations FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS bulk_operations_org_insert ON bulk_operations;
CREATE POLICY bulk_operations_org_insert ON bulk_operations FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS bulk_operations_org_update ON bulk_operations;
CREATE POLICY bulk_operations_org_update ON bulk_operations FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS bulk_operations_org_delete ON bulk_operations;
CREATE POLICY bulk_operations_org_delete ON bulk_operations FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- citation_source_intelligence
ALTER TABLE citation_source_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_source_intelligence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS citation_source_intelligence_org_select ON citation_source_intelligence;
CREATE POLICY citation_source_intelligence_org_select ON citation_source_intelligence FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS citation_source_intelligence_org_insert ON citation_source_intelligence;
CREATE POLICY citation_source_intelligence_org_insert ON citation_source_intelligence FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS citation_source_intelligence_org_update ON citation_source_intelligence;
CREATE POLICY citation_source_intelligence_org_update ON citation_source_intelligence FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS citation_source_intelligence_org_delete ON citation_source_intelligence;
CREATE POLICY citation_source_intelligence_org_delete ON citation_source_intelligence FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- client_portal_invites
ALTER TABLE client_portal_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_invites FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_portal_invites_org_select ON client_portal_invites;
CREATE POLICY client_portal_invites_org_select ON client_portal_invites FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS client_portal_invites_org_insert ON client_portal_invites;
CREATE POLICY client_portal_invites_org_insert ON client_portal_invites FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS client_portal_invites_org_update ON client_portal_invites;
CREATE POLICY client_portal_invites_org_update ON client_portal_invites FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS client_portal_invites_org_delete ON client_portal_invites;
CREATE POLICY client_portal_invites_org_delete ON client_portal_invites FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- client_portal_views
ALTER TABLE client_portal_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_views FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_portal_views_org_select ON client_portal_views;
CREATE POLICY client_portal_views_org_select ON client_portal_views FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS client_portal_views_org_insert ON client_portal_views;
CREATE POLICY client_portal_views_org_insert ON client_portal_views FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS client_portal_views_org_update ON client_portal_views;
CREATE POLICY client_portal_views_org_update ON client_portal_views FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS client_portal_views_org_delete ON client_portal_views;
CREATE POLICY client_portal_views_org_delete ON client_portal_views FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- comparison_prompt_results
ALTER TABLE comparison_prompt_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_prompt_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comparison_prompt_results_org_select ON comparison_prompt_results;
CREATE POLICY comparison_prompt_results_org_select ON comparison_prompt_results FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS comparison_prompt_results_org_insert ON comparison_prompt_results;
CREATE POLICY comparison_prompt_results_org_insert ON comparison_prompt_results FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS comparison_prompt_results_org_update ON comparison_prompt_results;
CREATE POLICY comparison_prompt_results_org_update ON comparison_prompt_results FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS comparison_prompt_results_org_delete ON comparison_prompt_results;
CREATE POLICY comparison_prompt_results_org_delete ON comparison_prompt_results FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- content_drafts
ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_drafts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_drafts_org_select ON content_drafts;
CREATE POLICY content_drafts_org_select ON content_drafts FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS content_drafts_org_insert ON content_drafts;
CREATE POLICY content_drafts_org_insert ON content_drafts FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS content_drafts_org_update ON content_drafts;
CREATE POLICY content_drafts_org_update ON content_drafts FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS content_drafts_org_delete ON content_drafts;
CREATE POLICY content_drafts_org_delete ON content_drafts FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- content_structure_audits
ALTER TABLE content_structure_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_structure_audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_structure_audits_org_select ON content_structure_audits;
CREATE POLICY content_structure_audits_org_select ON content_structure_audits FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS content_structure_audits_org_insert ON content_structure_audits;
CREATE POLICY content_structure_audits_org_insert ON content_structure_audits FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS content_structure_audits_org_update ON content_structure_audits;
CREATE POLICY content_structure_audits_org_update ON content_structure_audits FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS content_structure_audits_org_delete ON content_structure_audits;
CREATE POLICY content_structure_audits_org_delete ON content_structure_audits FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- conversation_journeys
ALTER TABLE conversation_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_journeys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_journeys_org_select ON conversation_journeys;
CREATE POLICY conversation_journeys_org_select ON conversation_journeys FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS conversation_journeys_org_insert ON conversation_journeys;
CREATE POLICY conversation_journeys_org_insert ON conversation_journeys FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS conversation_journeys_org_update ON conversation_journeys;
CREATE POLICY conversation_journeys_org_update ON conversation_journeys FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS conversation_journeys_org_delete ON conversation_journeys;
CREATE POLICY conversation_journeys_org_delete ON conversation_journeys FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- crawler_visit_logs
ALTER TABLE crawler_visit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler_visit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crawler_visit_logs_select ON crawler_visit_logs;
DROP POLICY IF EXISTS crawler_visit_logs_org_select ON crawler_visit_logs;
CREATE POLICY crawler_visit_logs_org_select ON crawler_visit_logs FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS crawler_visit_logs_insert ON crawler_visit_logs;
DROP POLICY IF EXISTS crawler_visit_logs_org_insert ON crawler_visit_logs;
CREATE POLICY crawler_visit_logs_org_insert ON crawler_visit_logs FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS crawler_visit_logs_update ON crawler_visit_logs;
DROP POLICY IF EXISTS crawler_visit_logs_org_update ON crawler_visit_logs;
CREATE POLICY crawler_visit_logs_org_update ON crawler_visit_logs FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS crawler_visit_logs_delete ON crawler_visit_logs;
DROP POLICY IF EXISTS crawler_visit_logs_org_delete ON crawler_visit_logs;
CREATE POLICY crawler_visit_logs_org_delete ON crawler_visit_logs FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- data_residency_log
ALTER TABLE data_residency_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_residency_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_residency_log_select ON data_residency_log;
DROP POLICY IF EXISTS data_residency_log_org_select ON data_residency_log;
CREATE POLICY data_residency_log_org_select ON data_residency_log FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS data_residency_log_insert ON data_residency_log;
DROP POLICY IF EXISTS data_residency_log_org_insert ON data_residency_log;
CREATE POLICY data_residency_log_org_insert ON data_residency_log FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS data_residency_log_update ON data_residency_log;
DROP POLICY IF EXISTS data_residency_log_org_update ON data_residency_log;
CREATE POLICY data_residency_log_org_update ON data_residency_log FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS data_residency_log_delete ON data_residency_log;
DROP POLICY IF EXISTS data_residency_log_org_delete ON data_residency_log;
CREATE POLICY data_residency_log_org_delete ON data_residency_log FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- drift_alerts
ALTER TABLE drift_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drift_alerts_org_select ON drift_alerts;
CREATE POLICY drift_alerts_org_select ON drift_alerts FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS drift_alerts_org_insert ON drift_alerts;
CREATE POLICY drift_alerts_org_insert ON drift_alerts FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS drift_alerts_org_update ON drift_alerts;
CREATE POLICY drift_alerts_org_update ON drift_alerts FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS drift_alerts_org_delete ON drift_alerts;
CREATE POLICY drift_alerts_org_delete ON drift_alerts FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- evidence_snapshots
ALTER TABLE evidence_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evidence_snapshots_org_select ON evidence_snapshots;
CREATE POLICY evidence_snapshots_org_select ON evidence_snapshots FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS evidence_snapshots_org_insert ON evidence_snapshots;
CREATE POLICY evidence_snapshots_org_insert ON evidence_snapshots FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS evidence_snapshots_org_update ON evidence_snapshots;
CREATE POLICY evidence_snapshots_org_update ON evidence_snapshots FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS evidence_snapshots_org_delete ON evidence_snapshots;
CREATE POLICY evidence_snapshots_org_delete ON evidence_snapshots FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- generated_reports
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS generated_reports_org_select ON generated_reports;
CREATE POLICY generated_reports_org_select ON generated_reports FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS generated_reports_org_insert ON generated_reports;
CREATE POLICY generated_reports_org_insert ON generated_reports FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS generated_reports_org_update ON generated_reports;
CREATE POLICY generated_reports_org_update ON generated_reports FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS generated_reports_org_delete ON generated_reports;
CREATE POLICY generated_reports_org_delete ON generated_reports FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- google_ai_mode_results
ALTER TABLE google_ai_mode_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ai_mode_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS google_ai_mode_results_org_select ON google_ai_mode_results;
CREATE POLICY google_ai_mode_results_org_select ON google_ai_mode_results FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS google_ai_mode_results_org_insert ON google_ai_mode_results;
CREATE POLICY google_ai_mode_results_org_insert ON google_ai_mode_results FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS google_ai_mode_results_org_update ON google_ai_mode_results;
CREATE POLICY google_ai_mode_results_org_update ON google_ai_mode_results FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS google_ai_mode_results_org_delete ON google_ai_mode_results;
CREATE POLICY google_ai_mode_results_org_delete ON google_ai_mode_results FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- hallucination_incidents
ALTER TABLE hallucination_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hallucination_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hallucination_incidents_org_select ON hallucination_incidents;
CREATE POLICY hallucination_incidents_org_select ON hallucination_incidents FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS hallucination_incidents_org_insert ON hallucination_incidents;
CREATE POLICY hallucination_incidents_org_insert ON hallucination_incidents FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS hallucination_incidents_org_update ON hallucination_incidents;
CREATE POLICY hallucination_incidents_org_update ON hallucination_incidents FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS hallucination_incidents_org_delete ON hallucination_incidents;
CREATE POLICY hallucination_incidents_org_delete ON hallucination_incidents FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- journey_run_results
ALTER TABLE journey_run_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_run_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journey_run_results_org_select ON journey_run_results;
CREATE POLICY journey_run_results_org_select ON journey_run_results FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS journey_run_results_org_insert ON journey_run_results;
CREATE POLICY journey_run_results_org_insert ON journey_run_results FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS journey_run_results_org_update ON journey_run_results;
CREATE POLICY journey_run_results_org_update ON journey_run_results FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS journey_run_results_org_delete ON journey_run_results;
CREATE POLICY journey_run_results_org_delete ON journey_run_results FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- linkedin_presence_audits
ALTER TABLE linkedin_presence_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_presence_audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS linkedin_presence_audits_org_select ON linkedin_presence_audits;
CREATE POLICY linkedin_presence_audits_org_select ON linkedin_presence_audits FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS linkedin_presence_audits_org_insert ON linkedin_presence_audits;
CREATE POLICY linkedin_presence_audits_org_insert ON linkedin_presence_audits FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS linkedin_presence_audits_org_update ON linkedin_presence_audits;
CREATE POLICY linkedin_presence_audits_org_update ON linkedin_presence_audits FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS linkedin_presence_audits_org_delete ON linkedin_presence_audits;
CREATE POLICY linkedin_presence_audits_org_delete ON linkedin_presence_audits FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- llmstxt_versions
ALTER TABLE llmstxt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE llmstxt_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS llmstxt_versions_org_select ON llmstxt_versions;
CREATE POLICY llmstxt_versions_org_select ON llmstxt_versions FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS llmstxt_versions_org_insert ON llmstxt_versions;
CREATE POLICY llmstxt_versions_org_insert ON llmstxt_versions FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS llmstxt_versions_org_update ON llmstxt_versions;
CREATE POLICY llmstxt_versions_org_update ON llmstxt_versions FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS llmstxt_versions_org_delete ON llmstxt_versions;
CREATE POLICY llmstxt_versions_org_delete ON llmstxt_versions FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_preferences_org_select ON notification_preferences;
CREATE POLICY notification_preferences_org_select ON notification_preferences FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS notification_preferences_org_insert ON notification_preferences;
CREATE POLICY notification_preferences_org_insert ON notification_preferences FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS notification_preferences_org_update ON notification_preferences;
CREATE POLICY notification_preferences_org_update ON notification_preferences FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS notification_preferences_org_delete ON notification_preferences;
CREATE POLICY notification_preferences_org_delete ON notification_preferences FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- org_feature_flags
ALTER TABLE org_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_feature_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_feature_flags_org_select ON org_feature_flags;
CREATE POLICY org_feature_flags_org_select ON org_feature_flags FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS org_feature_flags_org_insert ON org_feature_flags;
CREATE POLICY org_feature_flags_org_insert ON org_feature_flags FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS org_feature_flags_org_update ON org_feature_flags;
CREATE POLICY org_feature_flags_org_update ON org_feature_flags FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS org_feature_flags_org_delete ON org_feature_flags;
CREATE POLICY org_feature_flags_org_delete ON org_feature_flags FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- org_members
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_members_select ON org_members;
DROP POLICY IF EXISTS org_members_org_select ON org_members;
CREATE POLICY org_members_org_select ON org_members FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS org_members_insert ON org_members;
DROP POLICY IF EXISTS org_members_org_insert ON org_members;
CREATE POLICY org_members_org_insert ON org_members FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS org_members_update ON org_members;
DROP POLICY IF EXISTS org_members_org_update ON org_members;
CREATE POLICY org_members_org_update ON org_members FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS org_members_delete ON org_members;
DROP POLICY IF EXISTS org_members_org_delete ON org_members;
CREATE POLICY org_members_org_delete ON org_members FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- query_fan_out_results
ALTER TABLE query_fan_out_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_fan_out_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS query_fan_out_results_org_select ON query_fan_out_results;
CREATE POLICY query_fan_out_results_org_select ON query_fan_out_results FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS query_fan_out_results_org_insert ON query_fan_out_results;
CREATE POLICY query_fan_out_results_org_insert ON query_fan_out_results FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS query_fan_out_results_org_update ON query_fan_out_results;
CREATE POLICY query_fan_out_results_org_update ON query_fan_out_results FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS query_fan_out_results_org_delete ON query_fan_out_results;
CREATE POLICY query_fan_out_results_org_delete ON query_fan_out_results FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- remediation_tasks
ALTER TABLE remediation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE remediation_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS remediation_tasks_org_select ON remediation_tasks;
CREATE POLICY remediation_tasks_org_select ON remediation_tasks FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS remediation_tasks_org_insert ON remediation_tasks;
CREATE POLICY remediation_tasks_org_insert ON remediation_tasks FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS remediation_tasks_org_update ON remediation_tasks;
CREATE POLICY remediation_tasks_org_update ON remediation_tasks FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS remediation_tasks_org_delete ON remediation_tasks;
CREATE POLICY remediation_tasks_org_delete ON remediation_tasks FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- report_delivery_schedules
ALTER TABLE report_delivery_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_delivery_schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_delivery_schedules_org_select ON report_delivery_schedules;
CREATE POLICY report_delivery_schedules_org_select ON report_delivery_schedules FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS report_delivery_schedules_org_insert ON report_delivery_schedules;
CREATE POLICY report_delivery_schedules_org_insert ON report_delivery_schedules FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS report_delivery_schedules_org_update ON report_delivery_schedules;
CREATE POLICY report_delivery_schedules_org_update ON report_delivery_schedules FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS report_delivery_schedules_org_delete ON report_delivery_schedules;
CREATE POLICY report_delivery_schedules_org_delete ON report_delivery_schedules FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- report_templates
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_templates_org_select ON report_templates;
CREATE POLICY report_templates_org_select ON report_templates FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS report_templates_org_insert ON report_templates;
CREATE POLICY report_templates_org_insert ON report_templates FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS report_templates_org_update ON report_templates;
CREATE POLICY report_templates_org_update ON report_templates FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS report_templates_org_delete ON report_templates;
CREATE POLICY report_templates_org_delete ON report_templates FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- share_of_voice_snapshots
ALTER TABLE share_of_voice_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_of_voice_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS share_of_voice_snapshots_org_select ON share_of_voice_snapshots;
CREATE POLICY share_of_voice_snapshots_org_select ON share_of_voice_snapshots FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS share_of_voice_snapshots_org_insert ON share_of_voice_snapshots;
CREATE POLICY share_of_voice_snapshots_org_insert ON share_of_voice_snapshots FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS share_of_voice_snapshots_org_update ON share_of_voice_snapshots;
CREATE POLICY share_of_voice_snapshots_org_update ON share_of_voice_snapshots FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS share_of_voice_snapshots_org_delete ON share_of_voice_snapshots;
CREATE POLICY share_of_voice_snapshots_org_delete ON share_of_voice_snapshots FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_org_select ON subscriptions;
CREATE POLICY subscriptions_org_select ON subscriptions FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS subscriptions_org_insert ON subscriptions;
CREATE POLICY subscriptions_org_insert ON subscriptions FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS subscriptions_org_update ON subscriptions;
CREATE POLICY subscriptions_org_update ON subscriptions FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS subscriptions_org_delete ON subscriptions;
CREATE POLICY subscriptions_org_delete ON subscriptions FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- technical_audits
ALTER TABLE technical_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS technical_audits_org_select ON technical_audits;
CREATE POLICY technical_audits_org_select ON technical_audits FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS technical_audits_org_insert ON technical_audits;
CREATE POLICY technical_audits_org_insert ON technical_audits FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS technical_audits_org_update ON technical_audits;
CREATE POLICY technical_audits_org_update ON technical_audits FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS technical_audits_org_delete ON technical_audits;
CREATE POLICY technical_audits_org_delete ON technical_audits FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- topical_coverage_gaps
ALTER TABLE topical_coverage_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE topical_coverage_gaps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS topical_coverage_gaps_org_select ON topical_coverage_gaps;
CREATE POLICY topical_coverage_gaps_org_select ON topical_coverage_gaps FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS topical_coverage_gaps_org_insert ON topical_coverage_gaps;
CREATE POLICY topical_coverage_gaps_org_insert ON topical_coverage_gaps FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS topical_coverage_gaps_org_update ON topical_coverage_gaps;
CREATE POLICY topical_coverage_gaps_org_update ON topical_coverage_gaps FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS topical_coverage_gaps_org_delete ON topical_coverage_gaps;
CREATE POLICY topical_coverage_gaps_org_delete ON topical_coverage_gaps FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_org_select ON users;
CREATE POLICY users_org_select ON users FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS users_insert ON users;
DROP POLICY IF EXISTS users_org_insert ON users;
CREATE POLICY users_org_insert ON users FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_org_update ON users;
CREATE POLICY users_org_update ON users FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS users_delete ON users;
DROP POLICY IF EXISTS users_org_delete ON users;
CREATE POLICY users_org_delete ON users FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- visibility_trends
ALTER TABLE visibility_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE visibility_trends FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visibility_trends_org_select ON visibility_trends;
CREATE POLICY visibility_trends_org_select ON visibility_trends FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS visibility_trends_org_insert ON visibility_trends;
CREATE POLICY visibility_trends_org_insert ON visibility_trends FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS visibility_trends_org_update ON visibility_trends;
CREATE POLICY visibility_trends_org_update ON visibility_trends FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS visibility_trends_org_delete ON visibility_trends;
CREATE POLICY visibility_trends_org_delete ON visibility_trends FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- webhook_deliveries
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_deliveries_org_select ON webhook_deliveries;
CREATE POLICY webhook_deliveries_org_select ON webhook_deliveries FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS webhook_deliveries_org_insert ON webhook_deliveries;
CREATE POLICY webhook_deliveries_org_insert ON webhook_deliveries FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS webhook_deliveries_org_update ON webhook_deliveries;
CREATE POLICY webhook_deliveries_org_update ON webhook_deliveries FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS webhook_deliveries_org_delete ON webhook_deliveries;
CREATE POLICY webhook_deliveries_org_delete ON webhook_deliveries FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- webhook_endpoints
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_endpoints_org_select ON webhook_endpoints;
CREATE POLICY webhook_endpoints_org_select ON webhook_endpoints FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS webhook_endpoints_org_insert ON webhook_endpoints;
CREATE POLICY webhook_endpoints_org_insert ON webhook_endpoints FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS webhook_endpoints_org_update ON webhook_endpoints;
CREATE POLICY webhook_endpoints_org_update ON webhook_endpoints FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS webhook_endpoints_org_delete ON webhook_endpoints;
CREATE POLICY webhook_endpoints_org_delete ON webhook_endpoints FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- workflow_runs
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_runs_org_select ON workflow_runs;
CREATE POLICY workflow_runs_org_select ON workflow_runs FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS workflow_runs_org_insert ON workflow_runs;
CREATE POLICY workflow_runs_org_insert ON workflow_runs FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS workflow_runs_org_update ON workflow_runs;
CREATE POLICY workflow_runs_org_update ON workflow_runs FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS workflow_runs_org_delete ON workflow_runs;
CREATE POLICY workflow_runs_org_delete ON workflow_runs FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- youtube_presence_audits
ALTER TABLE youtube_presence_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_presence_audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS youtube_presence_audits_org_select ON youtube_presence_audits;
CREATE POLICY youtube_presence_audits_org_select ON youtube_presence_audits FOR SELECT
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS youtube_presence_audits_org_insert ON youtube_presence_audits;
CREATE POLICY youtube_presence_audits_org_insert ON youtube_presence_audits FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS youtube_presence_audits_org_update ON youtube_presence_audits;
CREATE POLICY youtube_presence_audits_org_update ON youtube_presence_audits FOR UPDATE
  USING      (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS youtube_presence_audits_org_delete ON youtube_presence_audits;
CREATE POLICY youtube_presence_audits_org_delete ON youtube_presence_audits FOR DELETE
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- SELF-SCOPED TABLE (organizations — id = current_org_id)
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_org_select ON organizations;
CREATE POLICY organizations_org_select ON organizations FOR SELECT
  USING (id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS organizations_org_insert ON organizations;
CREATE POLICY organizations_org_insert ON organizations FOR INSERT
  WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS organizations_org_update ON organizations;
CREATE POLICY organizations_org_update ON organizations FOR UPDATE
  USING      (id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);
DROP POLICY IF EXISTS organizations_org_delete ON organizations;
CREATE POLICY organizations_org_delete ON organizations FOR DELETE
  USING (id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- JOIN-SCOPED TABLE (citations — via audit_id -> audits.organization_id)
-- ============================================================

ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS citations_select ON citations;
DROP POLICY IF EXISTS citations_org_select ON citations;
CREATE POLICY citations_org_select ON citations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM audits a
    WHERE a.id = citations.audit_id
      AND a.organization_id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS citations_insert ON citations;
DROP POLICY IF EXISTS citations_org_insert ON citations;
CREATE POLICY citations_org_insert ON citations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM audits a
    WHERE a.id = citations.audit_id
      AND a.organization_id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS citations_update ON citations;
DROP POLICY IF EXISTS citations_org_update ON citations;
CREATE POLICY citations_org_update ON citations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM audits a
    WHERE a.id = citations.audit_id
      AND a.organization_id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM audits a
    WHERE a.id = citations.audit_id
      AND a.organization_id = current_setting('app.current_org_id', true)::uuid
  ));
DROP POLICY IF EXISTS citations_delete ON citations;
DROP POLICY IF EXISTS citations_org_delete ON citations;
CREATE POLICY citations_org_delete ON citations FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM audits a
    WHERE a.id = citations.audit_id
      AND a.organization_id = current_setting('app.current_org_id', true)::uuid
  ));

-- ============================================================
-- GLOBAL / AUTH / SYSTEM TABLES — NO RLS (intentionally)
-- ============================================================
-- ai_bot_ip_ranges      — operator-set bot IP ranges, shared across all orgs
-- ai_bot_registry       — operator-set bot definitions, shared across all orgs
-- auth_accounts         — Better Auth core (session management via serviceDb)
-- auth_organizations    — Better Auth org metadata (managed by auth library)
-- auth_sessions         — Better Auth sessions (managed by auth library)
-- auth_users            — Better Auth users (managed by auth library)
-- auth_verifications    — Better Auth verification tokens (managed by auth library)
-- canary_prompts        — system drift monitoring prompts, no tenant data
-- citability_methods    — shared reference catalog of citability methods
-- config_bundle_cache   — market config cache keyed by market/locale/segment, no org data
-- llm_response_cache    — shared LLM cache keyed by prompt hash, no org identifiers
-- market_ai_budget_policies — platform-wide market budget limits
-- metric_quality_gates  — platform-wide quality gate thresholds
-- processed_webhook_events — Stripe webhook dedup tracking, no tenant data
-- prompt_pack_coverage  — platform prompt coverage QA tracking
-- prompt_volume_estimates — market volume research data, shared
-- provider_market_capabilities — provider capability matrix, platform-wide
-- recommendation_research — shared research backing for recommendations
-- sampling_policies     — platform-wide sampling config
-- validation_corpus_results — platform validation QA results
-- vertical_pack_prompts — shared prompt templates for vertical packs
-- vertical_packs        — shared pack definitions by vertical/region

COMMIT;
