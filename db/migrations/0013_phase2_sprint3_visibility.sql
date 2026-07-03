-- Phase 2 Sprint 3: Visibility Intelligence + Market Gaps (Layer 2)
-- 7 new tables + column ALTERs on citations, notification_preferences, vertical_pack_prompts
-- MI-01 idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--   DROP POLICY IF EXISTS + CREATE POLICY for RLS (USING + WITH CHECK on tenant tables)

-- ============================================================
-- 1. share_of_voice_snapshots (#12, LLD 5873)
-- Per-engine, per-category SoV analytics. brand_share/competitor_share = PERCENTAGES 0-100.
-- ============================================================
CREATE TABLE IF NOT EXISTS share_of_voice_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  competitor_domain TEXT NOT NULL,
  prompt_category TEXT NOT NULL,
  engine TEXT NOT NULL,
  brand_share NUMERIC(5,2),
  competitor_share NUMERIC(5,2),
  total_prompts INTEGER NOT NULL,
  sample_quality TEXT NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sov_brand_engine_idx
  ON share_of_voice_snapshots (brand_id, engine, calculated_at DESC);

-- RLS (tenant table)
ALTER TABLE share_of_voice_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sov_snapshots_org_isolation ON share_of_voice_snapshots;
CREATE POLICY sov_snapshots_org_isolation ON share_of_voice_snapshots
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 2. prompt_volume_estimates (#13, LLD 5897) — GLOBAL seed table, RLS DISABLED
-- No organization_id. Cross-tenant volume estimates.
-- ============================================================
CREATE TABLE IF NOT EXISTS prompt_volume_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code TEXT NOT NULL,
  vertical TEXT NOT NULL,
  topic TEXT NOT NULL,
  category TEXT NOT NULL,
  estimated_monthly_volume INTEGER,
  volume_trend TEXT,
  confidence TEXT NOT NULL,
  data_source TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, vertical, topic, period_start)
);

-- RLS DISABLED: global seed table, no organization_id
ALTER TABLE prompt_volume_estimates DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. visibility_trends (#14, LLD 5939) — central visibility analytics
-- Per-dimension NUMERIC(5,2) averages. mention_rate/citation_rate = PERCENTAGES.
-- mention_source_ratio = 0-1, NULL when mention_rate=0.
-- ============================================================
CREATE TABLE IF NOT EXISTS visibility_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  period_label TEXT NOT NULL,
  period_type TEXT NOT NULL,
  score_composite_avg NUMERIC(5,2),
  score_frequency_avg NUMERIC(5,2),
  score_sentiment_avg NUMERIC(5,2),
  score_accuracy_avg NUMERIC(5,2),
  score_position_avg NUMERIC(5,2),
  score_context_avg NUMERIC(5,2),
  audit_count INTEGER NOT NULL,
  sample_quality TEXT NOT NULL,
  mention_rate NUMERIC(5,2),
  citation_rate NUMERIC(5,2),
  mention_source_ratio NUMERIC(5,2),
  brand_archetype TEXT,
  market_competition_label TEXT,
  citation_volatility_score NUMERIC(5,2),
  ai_referral_sessions INTEGER,
  ai_lead_estimate NUMERIC(8,2),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, period_label, period_type)
);

-- RLS (tenant table)
ALTER TABLE visibility_trends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visibility_trends_org_isolation ON visibility_trends;
CREATE POLICY visibility_trends_org_isolation ON visibility_trends
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 4. brand_web_mentions (#18, LLD 6112) — GAP 14
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_web_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  market_code TEXT NOT NULL DEFAULT 'AU_EN',
  source_platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  subreddit TEXT,
  mention_text TEXT,
  mention_sentiment TEXT,
  upvotes INTEGER,
  is_top_comment BOOLEAN,
  thread_recency_days INTEGER,
  is_indexed_by_google BOOLEAN,
  engine_citation_seen TEXT,
  vertical_match BOOLEAN,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_mentions_brand_idx
  ON brand_web_mentions (brand_id, detected_at);

CREATE INDEX IF NOT EXISTS brand_mentions_platform_idx
  ON brand_web_mentions (brand_id, source_platform, detected_at);

CREATE INDEX IF NOT EXISTS brand_mentions_market_idx
  ON brand_web_mentions (brand_id, market_code, detected_at);

CREATE INDEX IF NOT EXISTS brand_mentions_cited_idx
  ON brand_web_mentions (brand_id, engine_citation_seen)
  WHERE engine_citation_seen IS NOT NULL;

-- RLS (tenant table)
ALTER TABLE brand_web_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_web_mentions_org_isolation ON brand_web_mentions;
CREATE POLICY brand_web_mentions_org_isolation ON brand_web_mentions
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 5. query_fan_out_results (#15, LLD 6156) — GAP 1
-- ============================================================
CREATE TABLE IF NOT EXISTS query_fan_out_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  original_prompt TEXT NOT NULL,
  original_prompt_id UUID REFERENCES vertical_pack_prompts(id) ON DELETE SET NULL,
  engine TEXT NOT NULL,
  sub_query TEXT NOT NULL,
  sub_query_rank INTEGER NOT NULL,
  brand_appeared BOOLEAN NOT NULL,
  brand_position INTEGER,
  content_similarity_score NUMERIC(4,3),
  above_threshold BOOLEAN,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fan_out_brand_idx
  ON query_fan_out_results (brand_id, run_at);

CREATE INDEX IF NOT EXISTS fan_out_audit_idx
  ON query_fan_out_results (audit_id);

CREATE INDEX IF NOT EXISTS fan_out_threshold_idx
  ON query_fan_out_results (brand_id, above_threshold);

-- RLS (tenant table)
ALTER TABLE query_fan_out_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS query_fan_out_results_org_isolation ON query_fan_out_results;
CREATE POLICY query_fan_out_results_org_isolation ON query_fan_out_results
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 6. topical_coverage_gaps (#16, LLD 6183) — GAP 6
-- topic_cluster uses underscores (hyphen→underscore from vertical_pack_prompts.topic)
-- ============================================================
CREATE TABLE IF NOT EXISTS topical_coverage_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  vertical TEXT NOT NULL,
  topic_cluster TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  brand_has_content BOOLEAN NOT NULL,
  brand_content_depth INTEGER,
  brand_passage_count INTEGER,
  competitor_coverage JSONB,
  estimated_citation_impact NUMERIC(4,2),
  priority_rank INTEGER,
  cross_prompt_impact INTEGER,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, vertical, topic_cluster)
);

CREATE INDEX IF NOT EXISTS topic_gaps_brand_priority_idx
  ON topical_coverage_gaps (brand_id, priority_rank);

CREATE INDEX IF NOT EXISTS topic_gaps_cross_prompt_idx
  ON topical_coverage_gaps (brand_id, cross_prompt_impact DESC NULLS LAST);

-- RLS (tenant table)
ALTER TABLE topical_coverage_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topical_coverage_gaps_org_isolation ON topical_coverage_gaps;
CREATE POLICY topical_coverage_gaps_org_isolation ON topical_coverage_gaps
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 7. google_ai_mode_results (#17, LLD 6235) — GAP 5 STRETCH
-- Separate surface from Gemini; may stay behind flag.
-- ============================================================
CREATE TABLE IF NOT EXISTS google_ai_mode_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  prompt TEXT NOT NULL,
  brand_appeared BOOLEAN NOT NULL,
  brand_position INTEGER,
  sub_queries_shown JSONB,
  raw_response TEXT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS (tenant table)
ALTER TABLE google_ai_mode_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_ai_mode_results_org_isolation ON google_ai_mode_results;
CREATE POLICY google_ai_mode_results_org_isolation ON google_ai_mode_results
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 8. ALTER citations — add GAP 4 citation source intelligence columns
-- ============================================================
ALTER TABLE citations
  ADD COLUMN IF NOT EXISTS cited_source_type TEXT,
  ADD COLUMN IF NOT EXISTS cited_source_engine_affinity TEXT;

-- ============================================================
-- 9. ALTER notification_preferences — NP-01 per-alert-type toggles
-- ============================================================
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS email_on_hallucination BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_on_consensus BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_on_volatility BOOLEAN DEFAULT false;

-- ============================================================
-- 10. ALTER vertical_pack_prompts — persona, branded intent, source
-- ============================================================
ALTER TABLE vertical_pack_prompts
  ADD COLUMN IF NOT EXISTS persona_tag TEXT;

ALTER TABLE vertical_pack_prompts
  ADD COLUMN IF NOT EXISTS branded_intent TEXT;

ALTER TABLE vertical_pack_prompts
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'curated';
