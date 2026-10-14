-- diag-0050-cidr-inet-prod.sql (task #46, 10th follow-up)
--
-- Read-only. Shows whether migration 0024 (TEXT -> CIDR/INET for
-- ai_bot_ip_ranges.cidr / crawler_visit_logs.source_ip) and migration
-- 0025 (the dedup index that REQUIRES source_ip to already be inet) have
-- been applied to the production database. Run on the production branch
-- in the Neon SQL editor. NOT run from Claude Code.
--
-- How to read the result:
--   * format_type = 'cidr' / 'inet'  -> 0024 is applied. Expect
--     ai_bot_ip_ranges_cidr_idx, the (vendor, cidr, version_hash) unique
--     constraint, and crawler_logs_dedup_idx to all show 'present'. This
--     is the state the 56316a1 bundle's local validation (visibleau_prod
--     mirror) could NOT reproduce, because the mirror itself lacks 0024 --
--     see docs/ops/post-launch-db-hardening.md section 46 (9th
--     follow-up)'s "one finding" note. If prod shows this, it means prod
--     was already ahead of the local mirror, and this follow-up's
--     schema.ts fix (text() -> cidr()/inet()) brings the TS schema back
--     in line with what prod has had all along -- no further prod DDL
--     needed; the diag is purely confirmatory.
--   * format_type = 'text'  -> 0024 was never applied to prod. The
--     indexes/constraint below will show 'absent'. This is the scenario
--     that needs the actual follow-up: Sri would need to apply 0024 (and
--     0025, which depends on 0024) to real prod via psql, same as any
--     other hand-written migration -- NOT drizzle-kit push. This file
--     does not apply anything; it only reports which case prod is in.
--
-- STRICTLY READ-ONLY: no DDL, DML, SET, or side-effecting functions.

SELECT
  'ai_bot_ip_ranges.cidr' AS column_name,
  format_type(a.atttypid, a.atttypmod) AS live_type,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ai_bot_ip_ranges_cidr_idx') AS gist_index_present,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_version_hash_key'
      AND conrelid = 'ai_bot_ip_ranges'::regclass
  ) AS unique_constraint_present
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'ai_bot_ip_ranges'
  AND a.attname = 'cidr' AND a.attnum > 0 AND NOT a.attisdropped

UNION ALL

SELECT
  'crawler_visit_logs.source_ip',
  format_type(a.atttypid, a.atttypmod),
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'crawler_logs_dedup_idx'),
  NULL -- no unique constraint expected on this column; the dedup index above is the relevant check
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'crawler_visit_logs'
  AND a.attname = 'source_ip' AND a.attnum > 0 AND NOT a.attisdropped;
