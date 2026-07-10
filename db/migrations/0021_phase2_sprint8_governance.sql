-- Phase 2 Sprint 8: Governance Intelligence (Layer 7)
-- Tables 35-38: audit_trail, org_members, data_residency_log, org_feature_flags
-- MI-01: entire migration re-runnable (IF NOT EXISTS / DROP POLICY IF EXISTS)

-- ═══════════════════════════════════════════════════════════
-- Table 35: audit_trail
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_trail_org_idx
  ON audit_trail (organization_id, created_at DESC);

ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON audit_trail;
CREATE POLICY "org_isolation" ON audit_trail
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

-- ═══════════════════════════════════════════════════════════
-- Table 36: org_members
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'viewer',
  brand_access JSONB,
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  invitation_token TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_members_org_idx
  ON org_members (organization_id);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON org_members;
CREATE POLICY "org_isolation" ON org_members
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

-- ═══════════════════════════════════════════════════════════
-- Table 37: data_residency_log
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS data_residency_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  data_type TEXT NOT NULL,
  storage_region TEXT NOT NULL,
  provider TEXT NOT NULL,
  retention_period TEXT NOT NULL DEFAULT '12 months',
  encryption_status TEXT NOT NULL DEFAULT 'AES-256 at rest, TLS 1.3 in transit',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, data_type)
);

CREATE INDEX IF NOT EXISTS data_residency_org_idx
  ON data_residency_log (organization_id);

ALTER TABLE data_residency_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON data_residency_log;
CREATE POLICY "org_isolation" ON data_residency_log
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

-- ═══════════════════════════════════════════════════════════
-- Table 38: org_feature_flags
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS org_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  flag_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL,
  reason TEXT,
  set_by TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, flag_key)
);

CREATE INDEX IF NOT EXISTS org_feature_flags_org_idx
  ON org_feature_flags (organization_id, flag_key);

ALTER TABLE org_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON org_feature_flags;
CREATE POLICY "org_isolation" ON org_feature_flags
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
