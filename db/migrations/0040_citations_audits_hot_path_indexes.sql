-- Migration 0040 (task #46, 6th follow-up): index the two hot-path
-- queries every citation-intelligence/Citation-Failure read already
-- runs with no index backing it -- cost grows with TOTAL rows across
-- every customer, not with one audit's/brand's own rows.
--
-- citations_audit_run_idx: citations WHERE audit_id = ? AND run_number = 1
-- (buildCitationSourceIntelligence, checkBrandDomainNotCited, Evidence
-- Archive -- lib/trust/citation-intelligence.ts, lib/visibility/
-- citation-failure-diagnosis.ts, lib/trust/evidence-archiver.ts all
-- share this exact shape). is_branded_prompt is left as a residual
-- filter, not indexed -- organic rows dominate, so it narrows an
-- already-small per-audit result rather than the whole table.
--
-- audits_brand_completed_idx: audits WHERE brand_id = ? AND status =
-- 'complete' ORDER BY completed_at DESC LIMIT 1 (checkBrandDomainNotCited,
-- getCurrentCitationSources' latest-audit fallback -- both the exact
-- same shape). Partial on status = 'complete' since that's the only
-- status either caller ever filters on; completed_at DESC lets the
-- planner satisfy ORDER BY ... LIMIT 1 straight from the index, no sort.
--
-- Verified against a 30-brand x 8-audit x 4-engine x 5-run (72,000-row)
-- local seed: citations query went from a 1757-buffer Seq Scan
-- (5.77ms) to a 22-buffer Index Scan (0.135ms); audits query's plan
-- dropped its explicit Sort step entirely. See
-- docs/ops/post-launch-db-hardening.md section 46 (6th follow-up) for
-- the full EXPLAIN (ANALYZE, BUFFERS) output. Not apply-before-push --
-- see db/prod-fixes/0047-citations-audits-indexes-apply-prod.sql.

CREATE INDEX IF NOT EXISTS citations_audit_run_idx
  ON public.citations USING btree (audit_id, run_number);

CREATE INDEX IF NOT EXISTS audits_brand_completed_idx
  ON public.audits USING btree (brand_id, completed_at DESC)
  WHERE status = 'complete';
