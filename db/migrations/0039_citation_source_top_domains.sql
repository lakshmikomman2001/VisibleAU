-- Migration 0039: add citation_source_intelligence.top_domains.
--
-- Task #45: the "Unclassified 87.8%" bucket (and every real category)
-- hid which actual domains engines cite -- likely competitor plumbers'
-- own sites. Persisted at aggregation time (buildCitationSourceIntelligence)
-- rather than recomputed on every page load, which would mean re-scanning
-- raw citations and re-classifying on every request instead of once per
-- audit.
--
-- Nullable, additive: rows written before this column existed (and any
-- row whose non-fatal top_domains write failed) simply have no value
-- here -- the UI shows "Top domains appear after the next audit."
-- instead of an empty/broken list (see
-- components/domain/trust/source-gap-card.tsx).
--
-- APPLY-BEFORE-PUSH IS MANDATORY, not just recommended: citation_source_intelligence
-- is read with full-column selects by getCurrentCitationSources
-- (lib/trust/citation-intelligence.ts), narrative-generator.ts,
-- local-ai-trust-scorer.ts, and render-report-pdf.ts. If the app code
-- (top_domains added to db/schema/citation-source-intelligence.ts)
-- ships before this column exists in prod, all four of those surfaces
-- -- Citation Sources, Health Check / Agent Readiness, and the PDF
-- report -- throw 42703. The write itself (buildCitationSourceIntelligence)
-- is also made non-fatal as defence in depth, but that is not a
-- substitute for applying this first -- see
-- db/prod-fixes/0044-csi-top-domains-*-prod.sql.
--
-- See docs/ops/post-launch-db-hardening.md section 45.

BEGIN;

ALTER TABLE citation_source_intelligence
  ADD COLUMN IF NOT EXISTS top_domains jsonb;

COMMIT;
