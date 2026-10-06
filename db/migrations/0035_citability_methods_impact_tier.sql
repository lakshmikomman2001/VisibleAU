-- Migration 0035: add citability_methods.impact_tier
--
-- Sri's decision: effect_size_pct (e.g. wikipedia-presence = 47.90) is
-- invented precision -- the numbers originated with the fabricated SE
-- Ranking / AutoGEO data (tasks KKK/UUU/VVV/YYY stripped the citations but
-- kept the suspiciously-precise figures, relabelled "Vunnara estimate").
-- Nobody at Vunnara actually measured or estimated these percentages. This
-- adds a qualitative impact_tier ("high" | "medium" | "low") assigned by
-- genuine reasoning about each method's real AEO/GEO merit (see
-- db/seed/citability-methods/seed.ts and docs/ops/post-launch-db-hardening.md
-- section 32), to replace it as the only thing /methods renders and sorts
-- by.
--
-- effect_size_pct itself is NOT touched by this migration -- it is already
-- nullable (no NOT NULL in the original column definition), so the lower-
-- risk move is to leave the column in place and simply stop populating and
-- rendering it everywhere, rather than attempt this codebase's first-ever
-- DROP COLUMN against a table drizzle-kit can't properly track (see
-- db/migrations/README.md). See docs/ops/post-launch-db-hardening.md
-- section 32 for the full reasoning and the list of now-stale consumers.
--
-- Nullable, not backfilled by this migration -- existing rows keep
-- impact_tier NULL until the seed re-runs or a targeted UPDATE is applied.
-- This migration only adds the column; it does not touch any row's data.

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
