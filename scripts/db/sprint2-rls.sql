-- Sprint 2 RLS policies — idempotent (safe to re-run)
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_response_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_read ON audits;
CREATE POLICY audit_read ON audits
  FOR SELECT
  USING (organization_id::text = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS audit_write ON audits;
CREATE POLICY audit_write ON audits
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS citation_read ON citations;
CREATE POLICY citation_read ON citations
  FOR SELECT
  USING (
    audit_id IN (
      SELECT id FROM audits
      WHERE organization_id::text = current_setting('app.current_org_id', true)
    )
  );
