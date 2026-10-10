-- READ-ONLY precheck for the task #40 evidence_snapshots dedup backfill.
-- Run this against prod BEFORE applying 0040-apply-prod.sql. Nothing in
-- this file writes anything. NOT run from Claude Code.
--
-- Context: captureEvidenceSnapshots (lib/trust/evidence-archiver.ts)
-- copied every citations row for an audit -- including the ~4 byte-
-- identical cache-replay rows per (engine, prompt) pair -- into
-- evidence_snapshots, which has no run_number column of its own. Fixed
-- going forward (app code now filters to run_number = 1 before
-- capturing); this backfill is the OPTIONAL historical cleanup for rows
-- written before that fix. See docs/ops/post-launch-db-hardening.md
-- section 40. The app's read path (app/api/brands/[brandId]/evidence/route.ts)
-- already dedupes at read time (dedupeResponses()), so this backfill is
-- cosmetic/storage cleanup, not required for the screen to be honest.

-- 1. Total rows currently in evidence_snapshots.
SELECT count(*) AS total_rows FROM evidence_snapshots;

-- 2. Distinct (brand_id, engine, prompt, raw_response) groups -- this is
--    how many rows should remain after the backfill.
SELECT count(*) AS distinct_groups FROM (
  SELECT DISTINCT brand_id, engine, prompt, raw_response FROM evidence_snapshots
) d;

-- 3. How many rows the apply script would delete (total_rows - distinct_groups).
SELECT
  (SELECT count(*) FROM evidence_snapshots) -
  (SELECT count(*) FROM (SELECT DISTINCT brand_id, engine, prompt, raw_response FROM evidence_snapshots) d)
  AS rows_to_delete;

-- 4. Largest duplicate groups, for a sanity check against the expected
--    ~5x (1 real + up to 4 replays) pattern -- a group much larger than 5
--    would be unexpected and worth investigating before applying.
SELECT brand_id, engine, prompt, count(*) AS copies
FROM evidence_snapshots
GROUP BY brand_id, engine, prompt, raw_response
HAVING count(*) > 1
ORDER BY copies DESC
LIMIT 20;

-- 5. Context only: Bondi Plumbing's own counts, if present.
SELECT count(*) AS bondi_total_rows FROM evidence_snapshots
WHERE brand_id = '54b58fce-98f9-4749-ae25-9e541c0f874a';
SELECT count(*) AS bondi_distinct_groups FROM (
  SELECT DISTINCT engine, prompt, raw_response FROM evidence_snapshots
  WHERE brand_id = '54b58fce-98f9-4749-ae25-9e541c0f874a'
) d;
