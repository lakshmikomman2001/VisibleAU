-- Migration 0034: add citability_methods.citation_url + source_type
--
-- Task VVV: the authenticated /methods page renders citability_methods.source
-- as a bare string with no link, sorted by effect_size_pct DESC. Task KKK
-- found every one of its 22 "AutoGEO ICLR 2026" entries cites a real paper
-- (arXiv 2510.11438) for topics it doesn't study -- the paper is about
-- content rewriting, not schema/robots/CDN/meta/UX/AI-endpoint signals.
-- Task UUU separately stripped a different fabricated source ("SE Ranking
-- Dec 2025") that NN had already proved doesn't exist anywhere.
--
-- Per Sri: the effect-size percentages are Vunnara's own estimates. This adds
-- an explicit source_type ("research" | "vunnara_estimate") and a nullable
-- citation_url, populated by the seed for entries whose method genuinely
-- matches a real, already-verified source (lib/methodology/methods.ts's
-- Aggarwal et al. GEO paper, arxiv.org/abs/2311.09735) -- everything else is
-- explicitly a Vunnara estimate with citation_url NULL, not a bare
-- unlinked-but-implied-authoritative string.
--
-- Nullable, not backfilled by this migration: existing rows keep their old
-- (un-re-attributed) source string until the seed re-runs or a targeted
-- UPDATE is applied -- see docs/ops/post-launch-db-hardening.md. This
-- migration only adds the columns; it does not touch any row's data.

BEGIN;

ALTER TABLE citability_methods
  ADD COLUMN IF NOT EXISTS citation_url text;

ALTER TABLE citability_methods
  ADD COLUMN IF NOT EXISTS source_type text;

DO $$
BEGIN
  ALTER TABLE citability_methods
    ADD CONSTRAINT citability_methods_source_type_check
    CHECK (source_type IS NULL OR source_type IN ('research', 'vunnara_estimate'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
