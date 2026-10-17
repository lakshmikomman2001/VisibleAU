-- 0068-recompute-stored-scores-run3-post-check.sql (task #46, "fix:
-- stored value contradicting its own CI", Part B)
--
-- STATUS: OPTIONAL HYGIENE -- see run1-precheck.sql's header. Nothing in
-- the app reads score_composite/score_frequency from storage as a
-- displayed value any more; this only confirms the stored columns
-- themselves if Sri chose to run run2-apply.sql.
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER 0068-recompute-stored-scores-run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Same comparison as diag-0067-stored-vs-recomputed-scores.sql and
-- run1-precheck.sql, re-run against the now-updated audits table.
--
-- Expected result: mismatch_count = 0 (both composite_mismatch_count and
-- frequency_mismatch_count). A non-zero count here means either a new
-- audit completed between run2 and this check (re-run run2, harmless --
-- it's a full recompute, not incremental), or something about the apply
-- didn't take -- stop and don't drop the backup table if so.

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
SELECT
  COUNT(*) AS total_completed_audits,
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(a.score_composite, 0) - COALESCE(c.recomputed_composite, 0)) > 0.1
  ) AS composite_mismatch_count,
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(a.score_frequency, 0) - COALESCE(c.freq_value, 0)) > 0.1
  ) AS frequency_mismatch_count
FROM audits a
LEFT JOIN composite c ON c.audit_id = a.id
WHERE a.status = 'complete';
