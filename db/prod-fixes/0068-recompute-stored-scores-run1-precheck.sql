-- 0068-recompute-stored-scores-run1-precheck.sql (task #46, "fix: stored
-- value contradicting its own CI", Part B)
--
-- STATUS: OPTIONAL HYGIENE, not a correctness requirement. At the time
-- Part B was written, app/(auth)/agency/page.tsx and app/(auth)/
-- portfolio/page.tsx still read score_composite directly from storage
-- for their displayed Avg Composite / Score / Trend numbers -- that was
-- this file's original reason to exist. A follow-up fix rewired BOTH of
-- those pages onto the same live, batched recompute every other surface
-- already uses (one id-lookup query + one resolveOrganicDimensions call
-- across every brand's latest+previous audit, never one query per
-- brand). As of that follow-up, NOTHING in the app reads score_composite
-- /score_frequency/score_position/score_accuracy from storage as a
-- displayed value any more -- grep for `scoreComposite|scoreFrequency|
-- scorePosition|scoreAccuracy` outside the audit-completion writers
-- (lib/audit/run-audit-inline.ts, inngest/functions/run-audit.ts) and
-- tests confirms it. Applying this file now only keeps the STORED
-- columns themselves honest for any future direct SQL/export that might
-- read them, or as point-in-time history -- Sri decides whether that's
-- worth running.
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run BEFORE 0068-recompute-stored-scores-run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- SCOPE: of the five score_* columns on `audits`, this corrects
-- score_composite and score_frequency (diag-0067 reports both, and
-- frequency is the same cheap computation as composite's Frequency
-- term -- no reason to leave it stale once the row is being touched).
-- score_position, score_accuracy, score_sentiment_numeric,
-- score_context_numeric, score_confidence_low/high are deliberately left
-- untouched -- every real reader of those now recomputes live, so
-- writing them here would be changing data nothing depends on, for no
-- benefit.
--
-- Recompute formula is identical to diag-0067-stored-vs-recomputed-
-- scores.sql and to lib/scoring/resolve-audit-dimensions.ts: organic
-- (is_branded_prompt IS NOT TRUE) + run_number = 1 citations only;
-- composite = frequency_only basis (= Frequency alone) when zero
-- mentions, else (Frequency*5 + Position*5 + Accuracy*3) / 13.
--
-- Expected result: backup_table_already_exists = f (so run2 won't
-- silently skip creating a fresh snapshot), plus a count of how many
-- completed audits' score_composite will actually change -- expect
-- Bondi Plumbing's audits #2-8 at minimum, and a much larger number from
-- every pre-Phase-3 audit that used to blend fabricated Sentiment/Context
-- into the stored composite (see diag-0067's header for why that bucket
-- is expected to be large, not a sign of a second bug).

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = '_backup_0068_audit_scores'
  ) AS backup_table_already_exists;

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
    sample_count,
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
    freq_value,
    CASE WHEN mentioned_count = 0 THEN freq_value
         ELSE (freq_value * 5 + pos_value * 5 + acc_value * 3) / 13.0
    END AS recomputed_composite
  FROM recomputed
)
SELECT
  COUNT(*) AS total_completed_audits,
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(a.score_composite, 0) - ROUND(COALESCE(c.recomputed_composite, 0), 2)) > 0.1
  ) AS composite_rows_that_will_change,
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(a.score_frequency, 0) - ROUND(COALESCE(c.freq_value, 0), 2)) > 0.1
  ) AS frequency_rows_that_will_change
FROM audits a
LEFT JOIN composite c ON c.audit_id = a.id
WHERE a.status = 'complete';
