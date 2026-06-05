-- VisibleAU RLS Policies — Sprint 1
-- Idempotent: safe to re-run (DROP IF EXISTS before each CREATE)

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- organizations: each org sees only itself
DROP POLICY IF EXISTS org_isolation ON organizations;
CREATE POLICY org_isolation ON organizations
  FOR SELECT
  USING (id::text = current_setting('app.current_org_id', true));

-- users: each org sees only its own users
DROP POLICY IF EXISTS user_isolation ON users;
CREATE POLICY user_isolation ON users
  FOR SELECT
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- brands: read — each org sees only its own brands
DROP POLICY IF EXISTS brand_read ON brands;
CREATE POLICY brand_read ON brands
  FOR SELECT
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- brands: write — each org can only mutate its own brands
DROP POLICY IF EXISTS brand_write ON brands;
CREATE POLICY brand_write ON brands
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
