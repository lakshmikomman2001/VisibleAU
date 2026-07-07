-- Sprint 5: brand_entity_scores ALTER (Phase 1 table — nullable additions only)
-- MI-01: fully idempotent — safe to re-run (ADD COLUMN IF NOT EXISTS)
-- D-01: do NOT add entity_score (score_of_10 is canonical) or scored_at (checked_at exists)

-- Organization + market context
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS market_code TEXT DEFAULT 'AU_EN';

-- Local registry (market_code-driven: AU=ABN, NZ=NZBN, UK=Companies House)
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS local_reg_verified BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS local_reg_number TEXT;

-- Wikipedia local
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS wikipedia_local_present BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS wikipedia_local_url TEXT;

-- AU TLD
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS au_tld_present BOOLEAN;

-- Typed directory columns
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS hipages_present BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS hipages_rating NUMERIC(3,1);
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS yellow_pages_present BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS service_seeking_present BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS word_of_mouth_present BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS word_of_mouth_rating NUMERIC(3,1);
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS local_directory_count INTEGER;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS local_directory_details JSONB;

-- GAP 11: Knowledge Panel
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS knowledge_panel_present BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS knowledge_panel_accurate BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS knowledge_panel_url TEXT;

-- GAP 13: Wikidata
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS wikidata_entry_present BOOLEAN;
ALTER TABLE brand_entity_scores ADD COLUMN IF NOT EXISTS wikidata_entry_url TEXT;

-- Backfill organization_id from brands table
UPDATE brand_entity_scores
SET organization_id = brands.organization_id
FROM brands
WHERE brand_entity_scores.brand_id = brands.id
  AND brand_entity_scores.organization_id IS NULL;

-- Index for market-scoped lookups
CREATE INDEX IF NOT EXISTS brand_entity_market_idx
  ON brand_entity_scores(brand_id, market_code, checked_at DESC);
