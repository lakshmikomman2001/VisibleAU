-- 0051-ai-bot-ip-ranges-unique-precheck-prod.sql (task #46, 11th follow-up)
--
-- Read-only. Run on the production branch in the Neon SQL editor BEFORE
-- 0051-...-apply-prod.sql. Screenshot the whole grid. NOT run from
-- Claude Code.
--
-- Context: ai_bot_ip_ranges has no real duplicate protection -- the
-- existing UNIQUE (vendor, cidr, version_hash) constraint (migration
-- 0024, IF it was ever applied to this database -- see diag-0050)
-- includes version_hash, which differs on every refresh even when a
-- range itself hasn't changed, so it can never catch the real
-- duplicates. The real natural key is (vendor, cidr). This file shows
-- exactly how bad it is here before 0051-apply touches anything.

WITH
column_types AS (
  SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS live_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  WHERE c.relname = 'ai_bot_ip_ranges' AND c.relkind = 'r'
    AND a.attname IN ('vendor', 'cidr') AND a.attnum > 0 AND NOT a.attisdropped
),
dup_groups AS (
  SELECT vendor, cidr, count(*) AS row_count
  FROM ai_bot_ip_ranges
  GROUP BY vendor, cidr
  HAVING count(*) > 1
),
fk_refs AS (
  SELECT conname, conrelid::regclass AS referencing_table
  FROM pg_constraint
  WHERE confrelid = 'ai_bot_ip_ranges'::regclass
)

SELECT check_name, result, detail FROM (
  SELECT 1 AS seq, '0051: ai_bot_ip_ranges.cidr column type' AS check_name,
    'INFO' AS result,
    COALESCE((SELECT live_type FROM column_types WHERE attname = 'cidr'), 'COLUMN NOT FOUND') AS detail

  UNION ALL

  SELECT 2, '0051: total rows vs. distinct (vendor, cidr) pairs', 'INFO',
    (SELECT count(*)::text FROM ai_bot_ip_ranges) || ' total rows, ' ||
    (SELECT count(DISTINCT (vendor, cidr))::text FROM ai_bot_ip_ranges) || ' distinct (vendor, cidr) pairs, ' ||
    ((SELECT count(*) FROM ai_bot_ip_ranges) - (SELECT count(DISTINCT (vendor, cidr)) FROM ai_bot_ip_ranges))::text ||
    ' excess row(s) the apply file will remove'

  UNION ALL

  SELECT 3, '0051: duplicate (vendor, cidr) groups',
    CASE WHEN NOT EXISTS (SELECT 1 FROM dup_groups) THEN 'PASS' ELSE 'INFO' END,
    COALESCE(
      (SELECT string_agg(vendor || '/' || cidr::text || ' x' || row_count, ', ' ORDER BY row_count DESC)
       FROM (SELECT * FROM dup_groups ORDER BY row_count DESC LIMIT 20) top20),
      'none'
    ) || CASE WHEN (SELECT count(*) FROM dup_groups) > 20
               THEN ' (showing top 20 of ' || (SELECT count(*) FROM dup_groups)::text || ' groups)'
               ELSE '' END

  UNION ALL

  SELECT 4, '0051: rows referencing ai_bot_ip_ranges.id via FK (must be none for the dedupe DELETE to be safe)',
    CASE WHEN NOT EXISTS (SELECT 1 FROM fk_refs) THEN 'PASS' ELSE 'STOP' END,
    COALESCE((SELECT string_agg(conname || ' on ' || referencing_table::text, ', ') FROM fk_refs), 'none found')

  UNION ALL

  SELECT 5, '0051: does ai_bot_ip_ranges_vendor_cidr_unique already exist?', 'INFO',
    (EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_unique'
               AND conrelid = 'ai_bot_ip_ranges'::regclass))::text ||
    ' -- if true, 0051-apply has already run; re-running it is a safe no-op either way'

  UNION ALL

  SELECT 6, '0051: does the old (vendor, cidr, version_hash) constraint exist?', 'INFO',
    (EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_version_hash_key'
               AND conrelid = 'ai_bot_ip_ranges'::regclass))::text ||
    ' -- 0051-apply drops this one (it never prevented the real duplicates above)'
) AS checks
ORDER BY seq;
