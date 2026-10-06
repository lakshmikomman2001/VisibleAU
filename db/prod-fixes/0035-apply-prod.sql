-- Prod-apply for migration 0035 -- reproduced VERBATIM from
-- db/migrations/0035_citability_methods_impact_tier.sql so the live schema
-- matches exactly what db/schema/citability-methods.ts (the Drizzle model)
-- expects. Apply this BEFORE deploying the code that reads impact_tier --
-- the 6 Oct lesson (migration 0034 reached main before it reached prod,
-- see docs/ops/post-launch-db-hardening.md section 30).
--
-- SRI: take a Neon snapshot/branch before running (citability_methods is
-- currently empty on prod, so this is low-risk regardless, but keep the
-- gate consistent). Then run this file with
-- `psql -f db/prod-fixes/0035-apply-prod.sql "$PROD_DATABASE_URL"`
-- (or paste into the Neon SQL editor). NOT run from Claude Code.
--
-- Safety properties:
--   - Additive + nullable only: the new column allows NULL, so every
--     existing row (there are none on prod today) would get NULL and keep
--     passing its NOT NULL columns unchanged.
--   - The CHECK constraint explicitly allows NULL
--     (`impact_tier IS NULL OR impact_tier IN (...)`), so no backfill is
--     required to avoid a constraint-violation error.
--   - Idempotent: ADD COLUMN IF NOT EXISTS, and the constraint is wrapped
--     in a DO block that swallows duplicate_object -- safe to run twice.
--   - effect_size_pct is NOT touched by this migration -- see
--     db/schema/citability-methods.ts's deprecation comment and
--     docs/ops/post-launch-db-hardening.md section 32 for why it's left in
--     place (unpopulated) rather than dropped.

BEGIN;

ALTER TABLE citability_methods
  ADD COLUMN IF NOT EXISTS impact_tier text;

DO $$
BEGIN
  ALTER TABLE citability_methods
    ADD CONSTRAINT citability_methods_impact_tier_check
    CHECK (impact_tier IS NULL OR impact_tier IN ('high', 'medium', 'low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- After this runs: /methods, /api/citability-methods, and
-- lib/citability/catalogue.ts will all load without error (impact_tier
-- exists). Every row will still show no data until
-- db/prod-fixes/seed-citability-methods-prod.sql is also run -- see that
-- file for the 47-row load.
