-- 0051-ai-bot-ip-ranges-unique-apply-prod.sql (task #46, 11th follow-up)
--
-- Run on the PRODUCTION branch in the Neon SQL editor, AFTER
-- 0051-...-precheck-prod.sql and after confirming its row 1 ("cidr
-- column type") says "cidr", not "text" -- if it says "text", apply
-- migration 0024 first (see diag-0050-cidr-inet-prod.sql); this file
-- assumes cidr/inet are already the live types and will not convert
-- them itself.
--
-- *** RUN EACH SECTION SEPARATELY, ONE AT A TIME *** -- paste only one
-- section into the Neon SQL editor, run it, confirm its own result,
-- THEN move to the next section. Do not paste the whole file at once:
-- SECTION 2's CREATE INDEX CONCURRENTLY cannot run inside a transaction
-- block, and most hosted SQL editors (Neon's included) wrap a single
-- multi-statement submission in one implicit transaction, which would
-- make it fail with "CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block" even though the statement itself is standalone.
--
-- Apply-before-push: not applicable from Claude Code -- this file is
-- for Sri to run by hand against real prod. Locally, the equivalent
-- fix is migration 0041_ai_bot_ip_ranges_unique.sql (plain, non-
-- CONCURRENTLY -- safe for local/CI, where no live traffic is
-- competing for the table lock).

-- ============================================================
-- SECTION 1 of 3 -- type guard + dedupe (one transaction).
-- Keeps the row with the latest fetched_at per (vendor, cidr) -- that's
-- the most recently known state of each range, including a vendor
-- having dropped it (surfaces correctly as is_current = false on the
-- kept row). diag-0050/0051-precheck already confirmed no FK anywhere
-- references ai_bot_ip_ranges.id, so this DELETE is safe.
-- ============================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ai_bot_ip_ranges' AND column_name = 'cidr'
                   AND udt_name = 'cidr') THEN
    RAISE EXCEPTION 'ABORT: ai_bot_ip_ranges.cidr is not type cidr yet -- apply migration 0024 first (see diag-0050-cidr-inet-prod.sql), then re-run this file.';
  END IF;
END $$;

DELETE FROM ai_bot_ip_ranges a
USING (
  SELECT id, row_number() OVER (
    PARTITION BY vendor, cidr ORDER BY fetched_at DESC, id DESC
  ) AS rn
  FROM ai_bot_ip_ranges
) dedup
WHERE a.id = dedup.id AND dedup.rn > 1;

-- The old 3-column constraint never prevented the real duplicates
-- (version_hash differs on every refresh) and would overlap with the
-- new one below -- drop it now, inside the same transaction as the
-- dedupe it was supposed to guard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_version_hash_key'
               AND conrelid = 'ai_bot_ip_ranges'::regclass) THEN
    ALTER TABLE ai_bot_ip_ranges
      DROP CONSTRAINT ai_bot_ip_ranges_vendor_cidr_version_hash_key;
  END IF;
END $$;

COMMIT;

-- Confirm before moving to section 2: should show 0.
SELECT count(*) - count(DISTINCT (vendor, cidr)) AS excess_rows_remaining FROM ai_bot_ip_ranges;

-- ============================================================
-- SECTION 2 of 3 -- the unique index, CONCURRENTLY (its own statement,
-- its own submission to the editor -- see the file header).
-- CONCURRENTLY avoids locking the table against reads/writes from the
-- live ingest path while the index builds. If this fails partway
-- (connection drop, etc.), Postgres may leave an INVALID index behind --
-- check with the query below and DROP INDEX it before retrying.
-- ============================================================
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ai_bot_ip_ranges_vendor_cidr_unique
  ON ai_bot_ip_ranges (vendor, cidr);

-- Confirm before moving to section 3: should show one row, indisvalid = false.
SELECT indexrelid::regclass AS index_name, indisvalid
FROM pg_index WHERE indexrelid = 'ai_bot_ip_ranges_vendor_cidr_unique'::regclass;

-- ============================================================
-- SECTION 3 of 3 -- adopt the index as a real UNIQUE constraint
-- (instant -- just attaches existing_table metadata, no table scan).
-- ============================================================
ALTER TABLE ai_bot_ip_ranges
  ADD CONSTRAINT ai_bot_ip_ranges_vendor_cidr_unique
  UNIQUE USING INDEX ai_bot_ip_ranges_vendor_cidr_unique;

-- ============================================================
-- POST-CHECK -- run after section 3. All three should read as shown.
-- ============================================================
SELECT
  (SELECT count(*) - count(DISTINCT (vendor, cidr)) FROM ai_bot_ip_ranges) AS excess_rows, -- expect 0
  (EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_unique'
             AND conrelid = 'ai_bot_ip_ranges'::regclass)) AS new_constraint_present, -- expect true
  (EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_version_hash_key'
             AND conrelid = 'ai_bot_ip_ranges'::regclass)) AS old_constraint_still_present; -- expect false
