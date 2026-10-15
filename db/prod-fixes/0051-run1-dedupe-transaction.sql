-- 0051 RUN 1 of 6 -- PRODUCTION branch. Type guard + dedupe + drop old constraint (one transaction).
-- Expected: Statement executed successfully. Then run 0051-run2.

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
