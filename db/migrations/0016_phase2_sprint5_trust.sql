-- Sprint 5: Trust Intelligence (Layer 3)
-- MI-01: fully idempotent — safe to re-run

-- =====================================================================
-- ALTER: citations — add Phase 1 Sprint 3 columns if missing
-- =====================================================================
ALTER TABLE citations ADD COLUMN IF NOT EXISTS is_accurate BOOLEAN;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS hallucination_flags JSONB;

-- =====================================================================
-- Table 1: hallucination_incidents
-- =====================================================================
CREATE TABLE IF NOT EXISTS hallucination_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  citation_id       UUID REFERENCES citations(id) ON DELETE SET NULL,
  engine            TEXT NOT NULL,
  prompt            TEXT NOT NULL,
  incorrect_claim   TEXT NOT NULL,
  correct_value     TEXT,
  claim_type        TEXT NOT NULL,
  severity          TEXT NOT NULL,
  is_acknowledged   BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID REFERENCES users(id),
  is_false_positive BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hallucination_brand_idx
  ON hallucination_incidents(brand_id, created_at DESC);

-- =====================================================================
-- Table 2: evidence_snapshots
-- =====================================================================
CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  audit_id          UUID REFERENCES audits(id) ON DELETE SET NULL,
  engine            TEXT NOT NULL,
  prompt            TEXT NOT NULL,
  raw_response      TEXT NOT NULL,
  score_at_capture  NUMERIC(5,2),
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 3: citation_source_intelligence
-- =====================================================================
CREATE TABLE IF NOT EXISTS citation_source_intelligence (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                UUID NOT NULL REFERENCES brands(id),
  organization_id         UUID NOT NULL REFERENCES organizations(id),
  audit_id                UUID REFERENCES audits(id) ON DELETE CASCADE,
  engine                  TEXT NOT NULL,
  source_type             TEXT NOT NULL,
  citation_count          INTEGER NOT NULL,
  citation_share          NUMERIC(5,2),
  brand_present_in_source BOOLEAN NOT NULL,
  gap_severity            TEXT NOT NULL,
  market_benchmark        JSONB,
  source_affinity_note    TEXT,
  calculated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS csi_unique_with_audit
  ON citation_source_intelligence(brand_id, audit_id, engine, source_type)
  WHERE audit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS csi_unique_aggregate
  ON citation_source_intelligence(brand_id, engine, source_type)
  WHERE audit_id IS NULL;
CREATE INDEX IF NOT EXISTS csi_brand_engine_idx
  ON citation_source_intelligence(brand_id, engine, calculated_at DESC);

-- =====================================================================
-- Table 4: linkedin_presence_audits
-- =====================================================================
CREATE TABLE IF NOT EXISTS linkedin_presence_audits (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                    UUID NOT NULL REFERENCES brands(id),
  organization_id             UUID NOT NULL REFERENCES organizations(id),
  market_code                 TEXT NOT NULL DEFAULT 'AU_EN',
  company_page_url            TEXT,
  company_page_exists         BOOLEAN,
  company_page_followers      INTEGER,
  company_page_last_post_date DATE,
  company_posts_30d           INTEGER,
  company_articles_count      INTEGER,
  founder_profile_url         TEXT,
  founder_profile_exists      BOOLEAN,
  founder_followers           INTEGER,
  founder_posts_30d           INTEGER,
  founder_articles_count      INTEGER,
  founder_articles_500plus    INTEGER,
  knowledge_sharing_ratio     NUMERIC(4,3),
  original_content_ratio      NUMERIC(4,3),
  semantic_relevance_score    NUMERIC(4,3),
  presence_score              INTEGER,
  gaps                        JSONB,
  audited_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_brand_idx
  ON linkedin_presence_audits(brand_id, audited_at DESC);

-- =====================================================================
-- Table 5: brand_consensus_checks
-- =====================================================================
CREATE TABLE IF NOT EXISTS brand_consensus_checks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brands(id),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  market_code           TEXT NOT NULL DEFAULT 'AU_EN',
  source_type           TEXT NOT NULL,
  source_url            TEXT,
  name_match            BOOLEAN,
  service_match         BOOLEAN,
  location_match        BOOLEAN,
  price_positioning     TEXT,
  differentiators_match BOOLEAN,
  consistency_score     INTEGER,
  discrepancies         JSONB,
  checked_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, source_type)
);

CREATE INDEX IF NOT EXISTS consensus_brand_idx
  ON brand_consensus_checks(brand_id, checked_at DESC);

-- =====================================================================
-- Table 6: youtube_presence_audits
-- =====================================================================
CREATE TABLE IF NOT EXISTS youtube_presence_audits (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                        UUID NOT NULL REFERENCES brands(id),
  organization_id                 UUID NOT NULL REFERENCES organizations(id),
  market_code                     TEXT NOT NULL DEFAULT 'AU_EN',
  channel_url                     TEXT,
  channel_exists                  BOOLEAN,
  channel_subscriber_count        INTEGER,
  channel_total_videos            INTEGER,
  longform_video_count            INTEGER,
  shorts_count                    INTEGER,
  longform_ratio                  NUMERIC(4,3),
  howto_video_count               INTEGER,
  explainer_video_count           INTEGER,
  brand_topic_video_count         INTEGER,
  videos_with_transcript          INTEGER,
  videos_with_chapters            INTEGER,
  avg_chapter_count               NUMERIC(4,1),
  avg_description_length          INTEGER,
  embedding_pages_count           INTEGER,
  embedding_pages_with_schema     INTEGER,
  embedding_pages_with_transcript INTEGER,
  any_video_cited_in_audit        BOOLEAN,
  cited_video_urls                JSONB,
  presence_score                  INTEGER,
  gaps                            JSONB,
  audited_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS youtube_brand_idx
  ON youtube_presence_audits(brand_id, audited_at DESC);

-- =====================================================================
-- RLS on all 6 new tables (MI-01: DROP IF EXISTS before each CREATE)
-- =====================================================================
ALTER TABLE hallucination_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON hallucination_incidents;
CREATE POLICY "org_isolation" ON hallucination_incidents
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE evidence_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON evidence_snapshots;
CREATE POLICY "org_isolation" ON evidence_snapshots
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE citation_source_intelligence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON citation_source_intelligence;
CREATE POLICY "org_isolation" ON citation_source_intelligence
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE linkedin_presence_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON linkedin_presence_audits;
CREATE POLICY "org_isolation" ON linkedin_presence_audits
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE brand_consensus_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON brand_consensus_checks;
CREATE POLICY "org_isolation" ON brand_consensus_checks
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE youtube_presence_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON youtube_presence_audits;
CREATE POLICY "org_isolation" ON youtube_presence_audits
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
