-- Sprint 6: Retrieval Intelligence + Agent Readiness (Layer 1)
-- MI-01: fully idempotent -- safe to re-run

-- Table 1: crawler_visit_logs (append-only — no UNIQUE, no ON CONFLICT)
CREATE TABLE IF NOT EXISTS crawler_visit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  crawler_name      TEXT NOT NULL,
  crawler_tier      TEXT NOT NULL,
  visited_url       TEXT NOT NULL,
  status_code       INTEGER,
  response_time_ms  INTEGER,
  error_type        TEXT,
  raw_log_line      TEXT,
  is_active_agent   BOOLEAN NOT NULL DEFAULT false,
  referrer_ai_session TEXT,
  visit_purpose     TEXT,
  visited_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawler_logs_brand_idx ON crawler_visit_logs(brand_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS crawler_logs_crawler_idx ON crawler_visit_logs(crawler_name, visited_at DESC);
CREATE INDEX IF NOT EXISTS crawler_logs_purpose_idx ON crawler_visit_logs(brand_id, visit_purpose, visited_at DESC)
  WHERE visit_purpose IS NOT NULL;

-- RLS
ALTER TABLE crawler_visit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crawler_visit_logs_org_isolation" ON crawler_visit_logs;
CREATE POLICY "crawler_visit_logs_org_isolation" ON crawler_visit_logs
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

-- Table 2: content_structure_audits (UPSERT on brand_id, page_url)
CREATE TABLE IF NOT EXISTS content_structure_audits (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                  UUID NOT NULL REFERENCES brands(id),
  organization_id           UUID NOT NULL REFERENCES organizations(id),
  page_url                  TEXT NOT NULL,
  answer_capsule_score      INTEGER,
  faq_block_present         BOOLEAN,
  faq_schema_present        BOOLEAN,
  heading_structure         JSONB,
  capsule_gaps              JSONB,
  word_count                INTEGER,
  optimal_passage_count     INTEGER,
  last_modified             TEXT,
  days_since_published      INTEGER,
  freshness_risk            TEXT,
  content_format_detected   TEXT,
  citation_probability_score NUMERIC(4,3),
  is_entity_home_candidate  BOOLEAN,
  entity_home_has_org_schema BOOLEAN,
  entity_home_has_id_field  BOOLEAN,
  entity_home_same_as_count INTEGER,
  entity_home_page_url      TEXT,
  outbound_citation_count   INTEGER,
  has_author_attribution    BOOLEAN,
  audited_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, page_url)
);

CREATE INDEX IF NOT EXISTS content_structure_brand_idx ON content_structure_audits(brand_id);

-- RLS
ALTER TABLE content_structure_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_structure_audits_org_isolation" ON content_structure_audits;
CREATE POLICY "content_structure_audits_org_isolation" ON content_structure_audits
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

-- Table 3: llmstxt_versions
CREATE TABLE IF NOT EXISTS llmstxt_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  content           TEXT NOT NULL,
  depth_score       INTEGER NOT NULL,
  hosted_url        TEXT,
  is_current        BOOLEAN NOT NULL DEFAULT true,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS llmstxt_one_current_per_brand
  ON llmstxt_versions(brand_id) WHERE is_current = true;

-- RLS
ALTER TABLE llmstxt_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "llmstxt_versions_org_isolation" ON llmstxt_versions;
CREATE POLICY "llmstxt_versions_org_isolation" ON llmstxt_versions
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

-- Table 4: agent_readiness_scores (append-only — no UNIQUE, no ON CONFLICT)
CREATE TABLE IF NOT EXISTS agent_readiness_scores (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                      UUID NOT NULL REFERENCES brands(id),
  organization_id               UUID NOT NULL REFERENCES organizations(id),
  tech_llmstxt_present          BOOLEAN,
  tech_llmstxt_valid            BOOLEAN,
  tech_robots_allows_crawlers   BOOLEAN,
  tech_ssr_passes               BOOLEAN,
  tech_ai_discovery_endpoints   BOOLEAN,
  tech_page_load_fast           BOOLEAN,
  tech_mcp_endpoint_present     BOOLEAN,
  tech_mcp_endpoint_valid       BOOLEAN,
  tech_mcp_tools_count          INTEGER,
  tech_score                    INTEGER,
  entity_org_schema_present     BOOLEAN,
  entity_local_business_schema  BOOLEAN,
  entity_local_reg_in_schema    BOOLEAN,
  entity_name_consistent        BOOLEAN,
  entity_service_readable       BOOLEAN,
  entity_clarity_score          INTEGER,
  verify_abn_confirmed          BOOLEAN,
  verify_wikipedia_au           BOOLEAN,
  verify_au_directories         INTEGER,
  verify_review_citations       INTEGER,
  verify_expert_quotes          BOOLEAN,
  verify_score                  INTEGER,
  authority_topical_coverage    INTEGER,
  authority_prompt_appearance   INTEGER,
  authority_citation_diversity  INTEGER,
  authority_score               INTEGER,
  task_booking_accessible       BOOLEAN,
  task_pricing_visible          BOOLEAN,
  task_service_area_defined     BOOLEAN,
  task_faq_direct_answers       INTEGER,
  task_score                    INTEGER,
  local_ai_trust_score          INTEGER,
  total_score                   INTEGER,
  gaps                          JSONB,
  scored_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_readiness_brand_idx ON agent_readiness_scores(brand_id, scored_at DESC);

-- RLS
ALTER TABLE agent_readiness_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_readiness_scores_org_isolation" ON agent_readiness_scores;
CREATE POLICY "agent_readiness_scores_org_isolation" ON agent_readiness_scores
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
