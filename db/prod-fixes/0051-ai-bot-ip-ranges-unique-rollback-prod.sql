-- 0051-ai-bot-ip-ranges-unique-rollback-prod.sql (task #46, 11th follow-up)
--
-- Run on the PRODUCTION branch in the Neon SQL editor, only if
-- 0051-...-apply-prod.sql needs to be undone.
--
-- *** THE DEDUPE IS NOT REVERSIBLE *** -- section 1 of the apply file
-- DELETEs the superseded duplicate rows; this rollback only removes the
-- constraint and index it added, it does NOT restore those rows (there
-- is nothing to restore them FROM -- they were exact, superseded
-- duplicates of data that's still present in the row that was kept, not
-- distinct information). If you need the literal pre-apply row set
-- back, restore from a Neon branch/point-in-time snapshot taken BEFORE
-- running 0051-apply -- take one before you apply, not after, if
-- rollback is a real possibility for this change.
--
-- This file only undoes the constraint/index addition -- safe to run
-- even if you're fine with the dedupe staying.

-- If apply's section 3 ran, the index is owned by this constraint --
-- dropping the constraint removes its backing index automatically, and
-- a direct DROP INDEX on an owned index would fail. Try this first.
ALTER TABLE ai_bot_ip_ranges
  DROP CONSTRAINT IF EXISTS ai_bot_ip_ranges_vendor_cidr_unique;

-- Covers the partial-apply case (section 2 ran, section 3 never did,
-- so there's a bare index with no owning constraint yet). A no-op if
-- the ALTER TABLE above already removed it.
DROP INDEX CONCURRENTLY IF EXISTS ai_bot_ip_ranges_vendor_cidr_unique;

-- Confirm: should show false for both.
SELECT
  (EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_unique'
             AND conrelid = 'ai_bot_ip_ranges'::regclass)) AS constraint_still_present,
  (EXISTS (SELECT 1 FROM pg_indexes
           WHERE indexname = 'ai_bot_ip_ranges_vendor_cidr_unique')) AS index_still_present;
