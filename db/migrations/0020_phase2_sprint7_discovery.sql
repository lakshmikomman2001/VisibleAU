-- Sprint 7: Conversational Discovery Intelligence (Layer 4)
-- MI-01: fully idempotent -- safe to re-run

-- ─────────────────────────────────────────────────────────
-- Table 26: conversation_journeys
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_journeys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  journey_name      TEXT NOT NULL,
  vertical          TEXT NOT NULL,
  buyer_stage       TEXT NOT NULL,
  prompt_sequence   JSONB NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vertical CHECK constraint (added idempotently)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_journeys_vertical_check'
  ) THEN
    ALTER TABLE conversation_journeys
      ADD CONSTRAINT conversation_journeys_vertical_check
      CHECK (vertical IN ('tradies', 'allied_health', 'saas', 'professional_services', 'real_estate'));
  END IF;
END $$;

-- Buyer stage CHECK constraint (added idempotently)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_journeys_buyer_stage_check'
  ) THEN
    ALTER TABLE conversation_journeys
      ADD CONSTRAINT conversation_journeys_buyer_stage_check
      CHECK (buyer_stage IN ('awareness', 'consideration', 'decision'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- Table 27: journey_run_results
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journey_run_results (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id                  UUID NOT NULL REFERENCES conversation_journeys(id) ON DELETE CASCADE,
  brand_id                    UUID NOT NULL REFERENCES brands(id),
  organization_id             UUID NOT NULL REFERENCES organizations(id),
  engine                      TEXT NOT NULL,
  run_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  turn_results                JSONB NOT NULL,
  brand_appeared_in_n_turns   INTEGER NOT NULL,
  total_turns                 INTEGER NOT NULL,
  journey_score               NUMERIC(5,2),
  first_mention_turn          INTEGER
);

CREATE INDEX IF NOT EXISTS journey_results_brand_idx
  ON journey_run_results(brand_id, run_at DESC);
CREATE INDEX IF NOT EXISTS journey_results_journey_idx
  ON journey_run_results(journey_id, run_at DESC);

-- ─────────────────────────────────────────────────────────
-- Table 28: comparison_prompt_results
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comparison_prompt_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brands(id),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  audit_id              UUID REFERENCES audits(id) ON DELETE CASCADE,
  competitor_domain     TEXT NOT NULL,
  prompt                TEXT NOT NULL,
  engine                TEXT NOT NULL,
  brand_won             BOOLEAN,
  brand_mentioned       BOOLEAN NOT NULL,
  competitor_mentioned  BOOLEAN NOT NULL,
  verdict_snippet       TEXT,
  run_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comparison_brand_idx
  ON comparison_prompt_results(brand_id, run_at DESC);
CREATE INDEX IF NOT EXISTS comparison_audit_idx
  ON comparison_prompt_results(audit_id);
CREATE INDEX IF NOT EXISTS comparison_competitor_idx
  ON comparison_prompt_results(brand_id, competitor_domain, run_at DESC);

-- ─────────────────────────────────────────────────────────
-- RLS on all 3 tables
-- ─────────────────────────────────────────────────────────
ALTER TABLE conversation_journeys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON conversation_journeys;
CREATE POLICY "org_isolation" ON conversation_journeys
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE journey_run_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON journey_run_results;
CREATE POLICY "org_isolation" ON journey_run_results
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

ALTER TABLE comparison_prompt_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON comparison_prompt_results;
CREATE POLICY "org_isolation" ON comparison_prompt_results
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
