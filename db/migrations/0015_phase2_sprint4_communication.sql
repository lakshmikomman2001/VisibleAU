-- Sprint 4: Communication Intelligence (Layer 6)
-- MI-01: fully idempotent — safe to re-run

CREATE TABLE IF NOT EXISTS report_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  template_type     TEXT NOT NULL,
  sections          JSONB NOT NULL,
  tone              TEXT NOT NULL DEFAULT 'professional',
  is_default        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_reports (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                 UUID NOT NULL REFERENCES brands(id),
  organization_id          UUID NOT NULL REFERENCES organizations(id),
  audit_id                 UUID REFERENCES audits(id) ON DELETE SET NULL,
  template_id              UUID REFERENCES report_templates(id) ON DELETE SET NULL,
  report_type              TEXT NOT NULL,
  period_label             TEXT,
  narrative_text           TEXT NOT NULL,
  headline                 TEXT NOT NULL,
  key_wins                 JSONB,
  key_gaps                 JSONB,
  fan_out_summary          JSONB,
  topical_summary          JSONB,
  mention_source_summary   JSONB,
  linkedin_summary         JSONB,
  consensus_summary        JSONB,
  entity_home_summary      JSONB,
  knowledge_panel_summary  JSONB,
  confidence_notes         JSONB,
  pdf_url                  TEXT,
  email_sent_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_brand_type_idx
  ON generated_reports(brand_id, report_type, created_at DESC);

CREATE TABLE IF NOT EXISTS report_delivery_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  brand_id          UUID REFERENCES brands(id),
  template_id       UUID REFERENCES report_templates(id) ON DELETE SET NULL,
  frequency         TEXT NOT NULL,
  day_of_week       INTEGER,
  day_of_month      INTEGER,
  time_of_day       TEXT NOT NULL DEFAULT '23:00',
  recipient_emails  JSONB NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_sent_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on all 3 tables (MI-01: DROP IF EXISTS before each CREATE)
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON report_templates;
CREATE POLICY "org_isolation" ON report_templates
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON generated_reports;
CREATE POLICY "org_isolation" ON generated_reports
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE report_delivery_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON report_delivery_schedules;
CREATE POLICY "org_isolation" ON report_delivery_schedules
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
