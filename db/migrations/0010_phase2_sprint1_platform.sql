-- Phase 2 Sprint 1: Platform Foundation
-- 7 new tables + audits ALTER (4 nullable columns)

CREATE TABLE IF NOT EXISTS config_bundle_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code TEXT NOT NULL,
  locale TEXT NOT NULL,
  segment TEXT NOT NULL,
  bundle_version INTEGER NOT NULL,
  config_digest TEXT NOT NULL,
  resolved_config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, locale, segment, bundle_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS config_bundle_one_active
  ON config_bundle_cache (market_code, locale, segment)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS market_ai_budget_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code TEXT NOT NULL,
  segment TEXT NOT NULL,
  use_case TEXT NOT NULL,
  max_prompts_per_audit INTEGER NOT NULL DEFAULT 50,
  max_models_per_audit INTEGER NOT NULL DEFAULT 4,
  max_repeated_samples INTEGER NOT NULL DEFAULT 5,
  max_estimated_cost_cents INTEGER NOT NULL DEFAULT 500,
  max_fan_out_sub_queries INTEGER NOT NULL DEFAULT 12,
  hard_stop_on_budget BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, segment, use_case)
);

CREATE TABLE IF NOT EXISTS sampling_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code TEXT NOT NULL,
  segment TEXT NOT NULL,
  use_case TEXT NOT NULL,
  minimum_prompt_count INTEGER NOT NULL DEFAULT 10,
  recommended_prompt_count INTEGER NOT NULL DEFAULT 50,
  minimum_repeated_samples INTEGER NOT NULL DEFAULT 3,
  confidence_display_threshold NUMERIC(5,2) NOT NULL DEFAULT 0.60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, segment, use_case)
);

CREATE TABLE IF NOT EXISTS metric_quality_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL,
  market_code TEXT NOT NULL,
  minimum_samples INTEGER NOT NULL,
  minimum_provider_count INTEGER NOT NULL DEFAULT 2,
  insufficient_data_label TEXT NOT NULL DEFAULT 'Insufficient data',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(metric_key, market_code)
);

CREATE TABLE IF NOT EXISTS prompt_pack_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code TEXT NOT NULL,
  locale TEXT NOT NULL,
  segment TEXT NOT NULL,
  use_case TEXT NOT NULL,
  required_template_keys JSONB NOT NULL,
  available_template_keys JSONB NOT NULL,
  coverage_ratio NUMERIC(5,2) NOT NULL,
  coverage_status TEXT NOT NULL,
  last_validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, locale, segment, use_case)
);

CREATE TABLE IF NOT EXISTS provider_market_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL,
  model_key TEXT NOT NULL,
  market_code TEXT NOT NULL,
  locale TEXT NOT NULL,
  supports_web_retrieval BOOLEAN NOT NULL DEFAULT false,
  supports_citations BOOLEAN NOT NULL DEFAULT false,
  supports_location_context BOOLEAN NOT NULL DEFAULT false,
  supports_query_fan_out BOOLEAN NOT NULL DEFAULT false,
  max_fan_out_sub_queries INTEGER NOT NULL DEFAULT 12,
  max_context_tokens INTEGER,
  average_latency_ms INTEGER,
  estimated_cost_per_1k_cents NUMERIC(8,4),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_key, model_key, market_code, locale)
);

CREATE TABLE IF NOT EXISTS audit_cost_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  market_code TEXT NOT NULL,
  locale TEXT NOT NULL,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  actual_cost_cents INTEGER NOT NULL DEFAULT 0,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  provider_call_count INTEGER NOT NULL DEFAULT 0,
  budget_policy_id UUID REFERENCES market_ai_budget_policies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_cost_org_created_idx ON audit_cost_snapshots (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_cost_audit_id_idx ON audit_cost_snapshots (audit_id);

-- RLS on audit_cost_snapshots (tenant data)
ALTER TABLE audit_cost_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_cost_snapshots_org_policy" ON audit_cost_snapshots;
CREATE POLICY audit_cost_snapshots_org_policy ON audit_cost_snapshots
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- audits ALTER: 4 nullable columns
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS config_bundle_id UUID REFERENCES config_bundle_cache(id),
  ADD COLUMN IF NOT EXISTS config_digest TEXT,
  ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'pending';
