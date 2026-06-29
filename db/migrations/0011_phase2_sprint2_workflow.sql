-- Phase 2 Sprint 2: Workflow Intelligence
-- 3 new tables: remediation_tasks, workflow_runs, content_drafts
-- MI-01 idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--   DROP POLICY IF EXISTS + CREATE POLICY for RLS

-- ============================================================
-- 1. remediation_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS remediation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  brand_id UUID NOT NULL REFERENCES brands(id),
  audit_id UUID REFERENCES audits(id) ON DELETE SET NULL,
  recommendation_id UUID REFERENCES action_items(id) ON DELETE SET NULL,
  recommendation_key TEXT,
  title TEXT NOT NULL,
  description TEXT,
  dimension TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL,
  effort TEXT,
  confidence_label TEXT,
  assigned_to UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  wont_fix_reason TEXT,
  score_before NUMERIC(5,2),
  score_after NUMERIC(5,2),
  fan_out_before NUMERIC(5,2),
  fan_out_after NUMERIC(5,2),
  similarity_before NUMERIC(4,3),
  similarity_after NUMERIC(4,3),
  reaudit_id UUID REFERENCES audits(id) ON DELETE SET NULL,
  reaudit_deferred_reason TEXT,
  fan_out_gap_id UUID,
  topical_gap_id UUID,
  linkedin_gap_source TEXT,
  consensus_gap_source TEXT,
  lift_achieved NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_brand_status_idx
  ON remediation_tasks (brand_id, status);

CREATE INDEX IF NOT EXISTS tasks_assigned_idx
  ON remediation_tasks (assigned_to, status);

-- RLS
ALTER TABLE remediation_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS remediation_tasks_org_isolation ON remediation_tasks;
CREATE POLICY remediation_tasks_org_isolation ON remediation_tasks
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 2. workflow_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  brand_id UUID NOT NULL REFERENCES brands(id),
  workflow_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_runs_org_status_idx
  ON workflow_runs (organization_id, status);

CREATE INDEX IF NOT EXISTS workflow_runs_brand_scheduled_idx
  ON workflow_runs (brand_id, scheduled_for);

-- RLS
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_runs_org_isolation ON workflow_runs;
CREATE POLICY workflow_runs_org_isolation ON workflow_runs
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 3. content_drafts
-- ============================================================
CREATE TABLE IF NOT EXISTS content_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  brand_id UUID NOT NULL REFERENCES brands(id),
  task_id UUID REFERENCES remediation_tasks(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  content_format TEXT NOT NULL,
  format_recommendation_reason TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_sub_query TEXT,
  target_word_count INTEGER,
  word_count INTEGER,
  target_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_drafts_org_isolation ON content_drafts;
CREATE POLICY content_drafts_org_isolation ON content_drafts
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
