-- 0083-visibility-trends-mention-rate-run2-apply.sql (Vunnara, 20 Oct,
-- post-a093ceb, headline-fix follow-up, item 4)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql, and only once run1's
-- mismatch_count read 0 (if it didn't, STOP -- see run1's header).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Recomputes score_composite_avg, score_frequency_avg,
-- score_position_avg, score_accuracy_avg, audit_count, sample_quality
-- for every existing visibility_trends row, mirroring
-- aggregateVisibilityTrend's exact rule one field at a time -- see
-- run1-backup.sql's header for the full why, and
-- tests/integration/visibility-trends-mention-rate-sql-parity.integration.test.ts
-- for the proof this SQL and the TypeScript resolver agree on every
-- fixture. Never touches mention_rate/citation_rate/
-- mention_source_ratio/brand_archetype/market_competition_label/
-- citation_volatility_score -- those were never gated by the removed
-- sufficientMentionsExists or the headline's sample-size threshold, so
-- they were never stale this way.
--
-- Expected result: "Statement executed successfully" on the UPDATE tab,
-- then one row with backup_row_count == updated_row_count == the full
-- visibility_trends row count.
BEGIN;

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
-- Every complete audit in this brand+period -- no sufficientMentionsExists
-- filter (removed, item 3: a real 0% is exactly as real as any other
-- measurement, never excluded on mention count).
period_audits AS (
  SELECT pb.trend_id, a.id AS audit_id
  FROM period_bounds pb
  JOIN audits a
    ON a.brand_id = pb.brand_id
   AND a.status = 'complete'
   AND a.completed_at >= pb.period_start
   AND a.completed_at <= pb.period_end
),
-- Same aggregate resolve-audit-dimensions.ts's own resolveOrganicDimensions
-- computes: run-1, organic (is_branded_prompt IS NOT TRUE) citations only.
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
-- Mirrors resolveHeadline/resolvePosition/resolveDimension (lib/scoring/
-- dimension-result.ts) exactly: headline/frequency scored only at
-- sample_count >= 10 (MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE), regardless
-- of mentioned_count; Position scored only when mentioned_count > 0 AND
-- ranked_count > 0; Accuracy scored only when mentioned_count > 0. A
-- NULL value here means "not scored" -- AVG()/COUNT() below skip NULLs
-- on their own, exactly matching the TypeScript resolver's own
-- `if (status === "scored") values.push(...)` gate.
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
    -- auditCount = compositeValues.length in the TS resolver -- how many
    -- audits had a real, SCORED headline this period (COUNT() skips the
    -- NULLs headline_value already encodes "not scored" as).
    COUNT(headline_value) AS audit_count
  FROM audit_resolved
  GROUP BY trend_id
)
UPDATE visibility_trends vt
SET
  score_composite_avg = tr.composite_avg,
  score_frequency_avg = tr.frequency_avg,
  score_position_avg = tr.position_avg,
  score_accuracy_avg = tr.accuracy_avg,
  audit_count = tr.audit_count,
  -- Mirrors aggregateVisibilityTrend's own sampleQuality branch exactly
  -- (classifyByScore(auditCount >= 5 ? 80 : auditCount >= 3 ? 50 : 20),
  -- then Title-cased) -- see lib/confidence-labels/classify.ts.
  sample_quality = CASE
    WHEN tr.audit_count = 0 THEN 'Insufficient data'
    WHEN tr.audit_count >= 5 THEN 'Confirmed'
    WHEN tr.audit_count >= 3 THEN 'Likely'
    ELSE 'Hypothesis'
  END,
  updated_at = now()
FROM trend_recompute tr
WHERE vt.id = tr.trend_id;

-- A period/brand with real complete audits but NONE of them matched
-- (period_audits produced rows, but audit_organic/audit_resolved never
-- aggregate to a non-null headline anywhere -- a trend_recompute row
-- still exists with audit_count = 0 via COUNT(), so this branch is only
-- for a trend row with ZERO complete audits in its period at all, which
-- never appears in trend_recompute's GROUP BY output).
UPDATE visibility_trends
SET
  score_composite_avg = NULL,
  score_frequency_avg = NULL,
  score_position_avg = NULL,
  score_accuracy_avg = NULL,
  audit_count = 0,
  sample_quality = 'Insufficient data',
  updated_at = now()
WHERE id NOT IN (
  SELECT vt2.id
  FROM visibility_trends vt2
  JOIN (
    SELECT
      vt.id AS trend_id,
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
  ) pb ON pb.trend_id = vt2.id
  JOIN audits a
    ON a.brand_id = vt2.brand_id
   AND a.status = 'complete'
   AND a.completed_at >= pb.period_start
   AND a.completed_at <= pb.period_end
);

COMMIT;

SELECT
  (SELECT count(*) FROM _backup_0083_visibility_trends) AS backup_row_count,
  (SELECT count(*) FROM visibility_trends) AS updated_row_count;
