-- 0068-recompute-stored-scores-run2-apply.sql (task #46, "fix: stored
-- value contradicting its own CI", Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction -- it either fully applies or fully rolls back itself on
-- error. Run AFTER 0068-recompute-stored-scores-run1-precheck.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Snapshots every completed audit's CURRENT score_composite/
-- score_frequency into _backup_0068_audit_scores (Neon's SQL editor has
-- no \copy, so a plain table is the backup -- drop it later with
-- 0068-recompute-stored-scores-run4-drop-backup.sql, only once run3's
-- post-check looks right and no rollback is needed), then overwrites
-- both columns with the live organic/run-1 recompute -- the exact same
-- formula app/(auth)/audits/[auditId]/page.tsx and every other rewired
-- reader already use (lib/scoring/resolve-audit-dimensions.ts). See
-- run1-precheck's header for why only these two columns are touched.
--
-- Expected result: "Statement executed successfully" on every tab, then
-- the final SELECT returns one row with backup_row_count ==
-- updated_row_count == the completed-audit count from run1's precheck.
BEGIN;

CREATE TABLE _backup_0068_audit_scores AS
SELECT id, score_composite, score_frequency
FROM audits
WHERE status = 'complete';

WITH organic_run1 AS (
  SELECT
    audit_id,
    COUNT(*) AS sample_count,
    COALESCE(SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END), 0) AS mentioned_count,
    COALESCE(
      SUM(CASE WHEN brand_mentioned AND jsonb_array_length(cited_sources) > 0 THEN 1 ELSE 0 END),
      0
    ) AS acc_with_sources_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY position) FILTER (WHERE brand_mentioned)
      AS median_position
  FROM citations
  WHERE is_branded_prompt IS NOT TRUE
    AND run_number = 1
  GROUP BY audit_id
),
recomputed AS (
  SELECT
    audit_id,
    mentioned_count,
    CASE WHEN sample_count = 0 THEN 0
         ELSE (mentioned_count::numeric / sample_count) * 100
    END AS freq_value,
    CASE WHEN median_position IS NULL THEN 0
         ELSE (GREATEST(0, 1 - (median_position - 1) / 50.0) * 100)::numeric
    END AS pos_value,
    CASE WHEN mentioned_count = 0 THEN 0
         ELSE (acc_with_sources_count::numeric / mentioned_count) * 100
    END AS acc_value
  FROM organic_run1
),
composite AS (
  SELECT
    audit_id,
    ROUND(freq_value, 2) AS freq_value,
    ROUND(
      CASE WHEN mentioned_count = 0 THEN freq_value
           ELSE (freq_value * 5 + pos_value * 5 + acc_value * 3) / 13.0
      END,
      2
    ) AS recomputed_composite
  FROM recomputed
)
UPDATE audits
SET
  score_composite = COALESCE(composite.recomputed_composite, 0),
  score_frequency = COALESCE(composite.freq_value, 0)
FROM composite
WHERE audits.id = composite.audit_id
  AND audits.status = 'complete';

-- Completed audits with literally zero organic run-1 citations (no row
-- in `composite` at all -- the LEFT JOIN case run1-precheck's query
-- handled with COALESCE) still need a real 0, not their old stale value.
UPDATE audits
SET score_composite = 0, score_frequency = 0
WHERE status = 'complete'
  AND id NOT IN (
    SELECT DISTINCT audit_id FROM citations
    WHERE is_branded_prompt IS NOT TRUE AND run_number = 1
  );

COMMIT;

SELECT
  (SELECT count(*) FROM _backup_0068_audit_scores) AS backup_row_count,
  (SELECT count(*) FROM audits WHERE status = 'complete') AS updated_row_count;
