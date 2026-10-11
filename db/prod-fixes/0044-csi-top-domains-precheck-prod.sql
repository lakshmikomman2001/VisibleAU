-- READ-ONLY precheck for migration 0039 (citation_source_intelligence.top_domains).
-- Run this against prod in the Neon SQL editor BEFORE pushing this
-- task's commit. Nothing in this file writes anything. NOT run from
-- Claude Code.
--
-- APPLY-BEFORE-PUSH IS MANDATORY, not just recommended: citation_source_intelligence
-- is read with full-column selects by FOUR surfaces --
-- getCurrentCitationSources (Citation Sources screen),
-- narrative-generator.ts, local-ai-trust-scorer.ts (Health Check /
-- Agent Readiness), and render-report-pdf.ts (the PDF report). If the
-- app code ships before top_domains exists in prod, all four throw
-- 42703 ("column does not exist"). The write itself
-- (buildCitationSourceIntelligence) is also non-fatal as defence in
-- depth, but that only protects the WRITE path -- it does not stop the
-- four READERS above from throwing on their own full-column selects.
-- Apply first.
--
-- ORDER: snapshot -> run this precheck -> apply 0044-csi-top-domains-apply-prod.sql
-- ONLY IF top_domains is missing -> re-run this precheck to confirm ->
-- THEN push.

-- 1. Does citation_source_intelligence.top_domains already exist?
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'citation_source_intelligence' AND column_name = 'top_domains';

-- 2. Context only: how many rows currently exist (informational, not acted on).
SELECT count(*) AS total_rows FROM citation_source_intelligence;
