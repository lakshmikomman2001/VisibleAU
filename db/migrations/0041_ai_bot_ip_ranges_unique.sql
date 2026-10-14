-- Task #46 (11th follow-up): ai_bot_ip_ranges has no real duplicate
-- protection -- migration 0024's UNIQUE (vendor, cidr, version_hash)
-- includes version_hash, which is the SAME value for every row inserted
-- by one refreshIpRangesForVendor() call but a DIFFERENT value on the
-- next refresh even when the vendor's range list hasn't meaningfully
-- changed for a given range. That constraint can never catch the real
-- natural key -- confirmed on the untouched visibleau_prod mirror: 1913
-- total rows, only 383 distinct (vendor, cidr) pairs. The natural key
-- ingest actually needs is (vendor, cidr) -- see
-- lib/agent-analytics/ip-ranges.ts's own grouping
-- (`WHERE vendor = ? AND is_current = true`) and refreshIpRangesForVendor's
-- per-vendor existing-row lookup.
--
-- Dedupe keeps the row with the latest fetched_at per (vendor, cidr) --
-- that reflects the most recently known state of that range (including
-- a vendor having dropped it, which correctly surfaces as is_current =
-- false on the kept row). Confirmed via query on the untouched mirror:
-- of the 383 keys, the "latest fetched_at" row disagrees with
-- "is_current = true" for 362 of them -- not a bug, the vendor's most
-- recent refresh genuinely marked those ranges non-current; keeping the
-- latest is the only choice that doesn't resurrect stale state. No FK
-- anywhere references ai_bot_ip_ranges.id (checked pg_constraint
-- directly), so deleting superseded rows is safe.
DELETE FROM ai_bot_ip_ranges a
USING (
  SELECT id, row_number() OVER (
    PARTITION BY vendor, cidr ORDER BY fetched_at DESC, id DESC
  ) AS rn
  FROM ai_bot_ip_ranges
) dedup
WHERE a.id = dedup.id AND dedup.rn > 1;

-- The old 3-column constraint never prevented the real duplicates above
-- and is now a strict subset of the new one below -- drop it rather
-- than keep two overlapping unique indexes on the same table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_version_hash_key'
               AND conrelid = 'ai_bot_ip_ranges'::regclass) THEN
    ALTER TABLE ai_bot_ip_ranges
      DROP CONSTRAINT ai_bot_ip_ranges_vendor_cidr_version_hash_key;
  END IF;
END $$;

-- Local/CI only: a plain (non-CONCURRENTLY) unique index is fine here --
-- no live traffic, and CREATE INDEX CONCURRENTLY cannot run in the same
-- multi-statement transaction this file's statements share under
-- scripts/db/migrate-local.ts's sql.unsafe() (confirmed directly: it
-- throws 25001 "CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block" when combined with any other statement). Real
-- prod gets the CONCURRENTLY version as its own separate statement --
-- see db/prod-fixes/0051-ai-bot-ip-ranges-unique-apply-prod.sql.
CREATE UNIQUE INDEX IF NOT EXISTS ai_bot_ip_ranges_vendor_cidr_unique
  ON ai_bot_ip_ranges (vendor, cidr);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_unique'
                   AND conrelid = 'ai_bot_ip_ranges'::regclass) THEN
    ALTER TABLE ai_bot_ip_ranges
      ADD CONSTRAINT ai_bot_ip_ranges_vendor_cidr_unique
      UNIQUE USING INDEX ai_bot_ip_ranges_vendor_cidr_unique;
  END IF;
END $$;
