-- 0083-visibility-trends-mention-rate-run3-post-check.sql (Vunnara, 20
-- Oct, post-a093ceb, headline-fix follow-up, item 4)
--
-- PRODUCTION branch. Run on its own, as one editor submission.
-- READ-ONLY. Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Re-runs the exact same recompute as run2 (read-only this time) and
-- compares it against the now-updated visibility_trends table --
-- IS DISTINCT FROM is NULL-safe, so a row that's correctly NULL on both
-- sides (e.g. a period with zero complete audits) counts as matching.
--
-- Expected result: remaining_mismatch_count = 0.
WITH period_bounds AS (
  SELECT
    vt.id AS trend_id,
    vt.brand_id,
    CASE vt.period_type
      WHEN 'weekly' THEN to_date(vt.period_label, 'IYYY-"W"IW')::timestamptz
      WHEN 'monthly' THEN to_date(vt.period_label || '-01', 'YYYY-MM-DD')::timestamptz
    END AS period_start,
    CASE vt.period_type
      WHEN 'weekly' THEN
        to_date(vt.period_label, 'IYYY-"W"IW')::timestamptz + interval '7 days' - interval '1 millisecond'
      WHEN 'monthly' THEN
        (to_date(vt.period_label || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamptz - interval '1 millisecond'
    END AS period_end
  FROM visibility_trends vt
),
period_audits AS (
  SELECT pb.trend_id, a.id AS audit_id
  FROM period_bounds pb
  JOIN audits a
    ON a.brand_id = pb.brand_id
   AND a.status = 'complete'
   AND a.completed_at >= pb.period_start
   AND a.completed_at <= pb.period_end
),
audit_organic AS (
  SELECT
    pa.trend_id,
    pa.audit_id,
    COUNT(c.id) AS sample_count,
    COALESCE(SUM(CASE WHEN c.brand_mentioned THEN 1 ELSE 0 END), 0) AS mentioned_count,
    COALESCE(SUM(CASE WHEN c.brand_mentioned AND c.position IS NOT NULL THEN 1 ELSE 0 END), 0) AS ranked_count,
    COALESCE(
      SUM(CASE WHEN c.brand_mentioned AND jsonb_array_length(c.cited_sources) > 0 THEN 1 ELSE 0 END),
      0
    ) AS acc_with_sources_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.position) FILTER (WHERE c.brand_mentioned)
      AS median_position
  FROM period_audits pa
  LEFT JOIN citations c
    ON c.audit_id = pa.audit_id
   AND c.is_branded_prompt IS NOT TRUE
   AND c.run_number = 1
  GROUP BY pa.trend_id, pa.audit_id
),
audit_resolved AS (
  SELECT
    trend_id,
    audit_id,
    CASE WHEN sample_count >= 10
      THEN ROUND((mentioned_count::numeric / sample_count) * 100, 2)
      ELSE NULL
    END AS headline_value,
    CASE WHEN mentioned_count = 0 OR ranked_count = 0
      THEN NULL
      ELSE ROUND((GREATEST(0, 1 - (median_position - 1) / 50.0) * 100)::numeric, 2)
    END AS position_value,
    CASE WHEN mentioned_count = 0
      THEN NULL
      ELSE ROUND((acc_with_sources_count::numeric / mentioned_count) * 100, 2)
    END AS accuracy_value
  FROM audit_organic
),
trend_recompute AS (
  SELECT
    trend_id,
    ROUND(AVG(headline_value), 2) AS composite_avg,
    ROUND(AVG(headline_value), 2) AS frequency_avg,
    ROUND(AVG(position_value), 2) AS position_avg,
    ROUND(AVG(accuracy_value), 2) AS accuracy_avg,
    COUNT(headline_value) AS audit_count
  FROM audit_resolved
  GROUP BY trend_id
)
SELECT count(*) AS remaining_mismatch_count
FROM visibility_trends vt
LEFT JOIN trend_recompute tr ON tr.trend_id = vt.id
WHERE vt.score_composite_avg IS DISTINCT FROM tr.composite_avg
   OR vt.score_frequency_avg IS DISTINCT FROM tr.frequency_avg
   OR vt.score_position_avg IS DISTINCT FROM tr.position_avg
   OR vt.score_accuracy_avg IS DISTINCT FROM tr.accuracy_avg
   OR vt.audit_count IS DISTINCT FROM COALESCE(tr.audit_count, 0)
   OR vt.sample_quality IS DISTINCT FROM (
        CASE
          WHEN COALESCE(tr.audit_count, 0) = 0 THEN 'Insufficient data'
          WHEN tr.audit_count >= 5 THEN 'Confirmed'
          WHEN tr.audit_count >= 3 THEN 'Likely'
          ELSE 'Hypothesis'
        END
      );
