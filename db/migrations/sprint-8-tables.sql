-- ============================================================================
-- Sprint 8 Migration: Local SEO + Drift Detection + Exports + Webhooks
-- ============================================================================
-- Tables: drift_alerts, webhook_endpoints, webhook_deliveries,
--         audit_exports, bulk_operations
-- Run against any database missing these tables (dev or prod).
-- Idempotent: uses IF NOT EXISTS on all CREATE statements.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. drift_alerts — stores Wilson CI drift detection results per audit pair
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drift_alerts (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid         NOT NULL REFERENCES organizations(id),
  brand_id          uuid         NOT NULL REFERENCES brands(id),
  current_audit_id  uuid         NOT NULL REFERENCES audits(id),
  previous_audit_id uuid         NOT NULL REFERENCES audits(id),
  severity          text         NOT NULL,                          -- 'significant_drop' | 'significant_rise'
  score_delta       numeric(6,2),
  dimension_deltas  jsonb        NOT NULL DEFAULT '{}'::jsonb,
  acknowledged      boolean      NOT NULL DEFAULT false,
  acknowledged_at   timestamp with time zone,
  updated_at        timestamp with time zone NOT NULL DEFAULT now(),
  created_at        timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drift_alerts_org_acknowledged_idx
  ON drift_alerts (organization_id, acknowledged);
CREATE INDEX IF NOT EXISTS drift_alerts_brand_created_idx
  ON drift_alerts (brand_id, created_at);

-- RLS
ALTER TABLE drift_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON drift_alerts;
CREATE POLICY "org_isolation" ON drift_alerts
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 3. webhook_endpoints — per-org webhook configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid         NOT NULL REFERENCES organizations(id),
  url                  text         NOT NULL,
  channel              text         NOT NULL,                       -- 'slack' | 'discord' | 'sheets' | 'airtable' | 'email' | 'custom'
  events               text[]       NOT NULL,
  signing_secret       text         NOT NULL,
  is_active            boolean      NOT NULL DEFAULT true,
  last_delivery_at     timestamp with time zone,
  last_delivery_status text,
  updated_at           timestamp with time zone NOT NULL DEFAULT now(),
  created_at           timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON webhook_endpoints;
CREATE POLICY "org_isolation" ON webhook_endpoints
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 4. webhook_deliveries — delivery audit log (references webhook_endpoints)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     uuid         NOT NULL REFERENCES webhook_endpoints(id),
  organization_id uuid         NOT NULL REFERENCES organizations(id),
  event           text         NOT NULL,
  payload         jsonb        NOT NULL,
  attempt_number  integer      NOT NULL DEFAULT 1,
  response_status integer,
  response_body   text,
  delivered_at    timestamp with time zone,
  failed_at       timestamp with time zone,
  created_at      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_created_idx
  ON webhook_deliveries (endpoint_id, created_at);

-- RLS
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON webhook_deliveries;
CREATE POLICY "org_isolation" ON webhook_deliveries
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 5. audit_exports — tracks generated SARIF/JUnit/GHA/PDF exports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_exports (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id        uuid         NOT NULL REFERENCES audits(id),
  organization_id uuid         NOT NULL REFERENCES organizations(id),
  format          text         NOT NULL,                            -- 'sarif' | 'junit' | 'gha' | 'pdf'
  generated_at    timestamp with time zone NOT NULL DEFAULT now(),
  file_size_bytes integer,
  download_count  integer      NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_exports_audit_format_idx
  ON audit_exports (audit_id, format);

-- RLS
ALTER TABLE audit_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON audit_exports;
CREATE POLICY "org_isolation" ON audit_exports
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 6. bulk_operations — agency-tier bulk reaudit/export tracking (Sprint 9+)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bulk_operations (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid         NOT NULL REFERENCES organizations(id),
  operation_type   text         NOT NULL,                           -- 'reaudit' | 'csv_export' | 'ga4_push' | 'sarif_export'
  status           text         NOT NULL DEFAULT 'pending',         -- 'pending' | 'running' | 'complete' | 'failed'
  total_brands     integer      NOT NULL DEFAULT 0,
  completed_brands integer      NOT NULL DEFAULT 0,
  failed_brands    integer      NOT NULL DEFAULT 0,
  input_params     jsonb        NOT NULL DEFAULT '{}'::jsonb,
  output_url       text,
  error_message    text,
  started_at       timestamp with time zone,
  completed_at     timestamp with time zone,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON bulk_operations;
CREATE POLICY "org_isolation" ON bulk_operations
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

COMMIT;
