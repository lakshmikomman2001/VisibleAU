-- Task #40: evidence_snapshots dedup backfill. OPTIONAL cleanup --
-- the app's read path already dedupes at read time, so the Evidence
-- Archive screen is already honest without this. This is storage/table
-- cleanup: removes the cache-replay duplicate rows so the table stops
-- growing ~5x faster than necessary and the read query can eventually
-- simplify back to a plain ORDER BY captured_at DESC LIMIT 200 with no
-- app-level dedupe step. See docs/ops/post-launch-db-hardening.md
-- section 40.
--
-- Sri-authorized only. NOT run from Claude Code.
-- REQUIRED before running this: take a Neon snapshot/branch of prod
-- (per CLAUDE.md's "pg_dump backup first" rule) -- this is a DELETE with
-- no SQL-level undo (see 0040-rollback-prod.sql).
--
-- Ordering: run 0040-precheck-prod.sql first and sanity-check the
-- numbers (especially query 4 -- no group should be wildly larger than
-- ~5) before running this.
--
-- Keeps the NEWEST row (by captured_at, tiebroken by id) in each
-- (brand_id, engine, prompt, raw_response) group -- matching exactly
-- what the app's read-time dedupe already keeps (it orders newest-first
-- and keeps the first occurrence), so this backfill changes nothing a
-- user would see, only what's stored.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY brand_id, engine, prompt, raw_response
      ORDER BY captured_at DESC, id DESC
    ) AS rn
  FROM evidence_snapshots
)
DELETE FROM evidence_snapshots
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Verify: total rows should now equal the precheck's "distinct_groups" count.
SELECT count(*) AS total_rows_after_backfill FROM evidence_snapshots;

COMMIT;
