-- diag-0067-stored-vs-recomputed-scores.sql (task #46, "fix: stored value
-- contradicting its own CI", Part B, read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: Part A fixed every CODE READER to compute the displayed value,
-- its CI, its state, and its subtitle from ONE live recompute over real
-- `citations` rows (lib/scoring/resolve-audit-dimensions.ts), instead of
-- trusting the stored audits.score_* columns the old code used for the
-- VALUE while already computing CI/state live. That fixes every surface
-- a human loads a page or email for. It does NOT fix the stored columns
-- themselves, which THREE surfaces still read directly in raw cross-audit
-- SQL (app/(auth)/agency/page.tsx's Avg Composite Score + Top Movers,
-- app/(auth)/portfolio/page.tsx's equivalents) because recomputing live
-- for "every audit across every brand in the org" on every dashboard load
-- is an N+1-shaped cost those two pages can't absorb. Those stay correct
-- only if the STORED columns are correct -- this query measures how far
-- they've drifted, as evidence for deciding whether a bulk recompute
-- (0068, scoped separately, NOT created by this file) is warranted.
--
-- Two independent drift sources, both expected, both worth telling apart:
--
--   (1) BASIS-FLIP mismatches (the dangerous kind -- the exact Bondi #2-8
--       shape): a prod-fix (0066) retroactively changed is_branded_prompt
--       on existing citations rows WITHOUT the audit being re-run, so an
--       audit that used to have organic mentions now recomputes to zero.
--       Its stored composite/frequency are stale non-zero numbers that no
--       longer correspond to any real measurement -- Query 3 isolates
--       exactly this bucket.
--
--   (2) WEIGHTED-BLEND mismatches (expected to be near-universal across
--       EVERY audit completed before the Phase 3 "not_measured" commit,
--       not a bug specific to any one brand): the old composite formula
--       blended Sentiment (20%) and Context (15%) into the weighted
--       score; Phase 3 found neither has a real classifier behind it
--       (lib/scoring/dimension-result.ts's top comment) and excludes
--       both, renormalising Frequency/Position/Accuracy from
--       0.25/0.25/0.15 to 5/13, 5/13, 3/13. Any pre-Phase-3 audit with a
--       non-null stored score_sentiment_numeric/score_context_numeric
--       will mismatch on composite for this reason alone, even with
--       zero drift in the underlying citations. Query 1 buckets this
--       separately from (1) so Sri can judge the practical blast radius
--       (hundreds of legacy audits, expected) before deciding whether a
--       bulk 0068 recompute is worth running, versus the much smaller,
--       more urgent (1) bucket.
--
-- Recompute formulas mirror lib/scoring/resolve-audit-dimensions.ts and
-- lib/scoring/dimension-result.ts exactly (organic = is_branded_prompt
-- IS NOT TRUE, run_number = 1; Position = (1 - (median-1)/50) * 100 off
-- PERCENTILE_CONT median of mentioned rows' `position`; Accuracy =
-- mentioned-with-cited-sources / mentioned * 100; composite = frequency_
-- only when mentioned_count = 0, else (freq*5 + pos*5 + acc*3) / 13).
--
-- Three separate statements, run as one editor submission (3 result
-- tabs) -- Postgres scopes a WITH clause to the one statement after it,
-- so the shared organic_run1/recomputed/composite/joined CTE chain is
-- repeated before each query rather than shared across them.

-- Query 1: summary -- how many completed audits mismatch beyond 0.1
-- tolerance, split into the two drift sources described above. No
-- audit/brand ids -- safe to paste anywhere.
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
    sample_count,
    mentioned_count,
    freq_value,
    pos_value,
    acc_value,
    CASE WHEN mentioned_count = 0 THEN freq_value
         ELSE (freq_value * 5 + pos_value * 5 + acc_value * 3) / 13.0
    END AS recomputed_composite,
    CASE WHEN mentioned_count = 0 THEN 'frequency_only' ELSE 'weighted' END AS recomputed_basis
  FROM recomputed
),
joined AS (
  SELECT
    a.id AS audit_id,
    a.brand_id,
    a.completed_at,
    a.score_composite AS stored_composite,
    a.score_frequency AS stored_frequency,
    a.score_sentiment_numeric AS stored_sentiment_numeric,
    a.score_context_numeric AS stored_context_numeric,
    COALESCE(c.sample_count, 0) AS recomputed_sample_count,
    COALESCE(c.mentioned_count, 0) AS recomputed_mentioned_count,
    ROUND(COALESCE(c.freq_value, 0), 2) AS recomputed_frequency,
    ROUND(COALESCE(c.recomputed_composite, 0), 2) AS recomputed_composite,
    COALESCE(c.recomputed_basis, 'frequency_only') AS recomputed_basis
  FROM audits a
  LEFT JOIN composite c ON c.audit_id = a.id
  WHERE a.status = 'complete'
)
SELECT
  COUNT(*) AS total_completed_audits,
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(stored_composite, 0) - recomputed_composite) > 0.1
  ) AS composite_mismatch_count,
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(stored_composite, 0) - recomputed_composite) > 0.1
      AND (stored_sentiment_numeric IS NOT NULL OR stored_context_numeric IS NOT NULL)
  ) AS mismatch_with_legacy_sentiment_or_context_blended_in,
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(stored_composite, 0) - recomputed_composite) > 0.1
      AND stored_sentiment_numeric IS NULL AND stored_context_numeric IS NULL
  ) AS mismatch_with_no_legacy_sentiment_or_context,
  COUNT(*) FILTER (
    WHERE recomputed_mentioned_count = 0 AND COALESCE(stored_composite, 0) > 0.1
  ) AS basis_flip_zero_mentions_but_nonzero_stored_count,
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(stored_frequency, 0) - recomputed_frequency) > 0.1
  ) AS frequency_mismatch_count
FROM joined;

-- Query 2: every completed audit whose stored composite OR frequency
-- disagrees with the live organic/run-1 recompute by more than 0.1 --
-- audit_id/brand_id only, no customer-identifying columns.
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
    sample_count,
    mentioned_count,
    freq_value,
    pos_value,
    acc_value,
    CASE WHEN mentioned_count = 0 THEN freq_value
         ELSE (freq_value * 5 + pos_value * 5 + acc_value * 3) / 13.0
    END AS recomputed_composite,
    CASE WHEN mentioned_count = 0 THEN 'frequency_only' ELSE 'weighted' END AS recomputed_basis
  FROM recomputed
),
joined AS (
  SELECT
    a.id AS audit_id,
    a.brand_id,
    a.completed_at,
    a.score_composite AS stored_composite,
    a.score_frequency AS stored_frequency,
    a.score_sentiment_numeric AS stored_sentiment_numeric,
    a.score_context_numeric AS stored_context_numeric,
    COALESCE(c.sample_count, 0) AS recomputed_sample_count,
    COALESCE(c.mentioned_count, 0) AS recomputed_mentioned_count,
    ROUND(COALESCE(c.freq_value, 0), 2) AS recomputed_frequency,
    ROUND(COALESCE(c.recomputed_composite, 0), 2) AS recomputed_composite,
    COALESCE(c.recomputed_basis, 'frequency_only') AS recomputed_basis
  FROM audits a
  LEFT JOIN composite c ON c.audit_id = a.id
  WHERE a.status = 'complete'
)
SELECT
  audit_id,
  brand_id,
  completed_at,
  stored_composite,
  recomputed_composite,
  recomputed_basis,
  stored_frequency,
  recomputed_frequency,
  recomputed_sample_count,
  recomputed_mentioned_count,
  (stored_sentiment_numeric IS NOT NULL OR stored_context_numeric IS NOT NULL)
    AS legacy_sentiment_or_context_blended_in
FROM joined
WHERE ABS(COALESCE(stored_composite, 0) - recomputed_composite) > 0.1
   OR ABS(COALESCE(stored_frequency, 0) - recomputed_frequency) > 0.1
ORDER BY ABS(COALESCE(stored_composite, 0) - recomputed_composite) DESC, audit_id;

-- Query 3: the dangerous subset -- audits that recompute to ZERO organic
-- mentions (a real, honest 0) while the stored composite is still a
-- stale non-zero number from before the citations changed underneath
-- them (the exact Bondi Plumbing #2-8 shape found manually before this
-- diagnostic existed). Every row here is a displayed-value-outside-its-
-- own-CI bug on any surface that hasn't been rewired to Part A's live
-- recompute, and the highest-priority rows for a possible 0068 fix.
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
    sample_count,
    mentioned_count,
    freq_value,
    pos_value,
    acc_value,
    CASE WHEN mentioned_count = 0 THEN freq_value
         ELSE (freq_value * 5 + pos_value * 5 + acc_value * 3) / 13.0
    END AS recomputed_composite,
    CASE WHEN mentioned_count = 0 THEN 'frequency_only' ELSE 'weighted' END AS recomputed_basis
  FROM recomputed
),
joined AS (
  SELECT
    a.id AS audit_id,
    a.brand_id,
    a.completed_at,
    a.score_composite AS stored_composite,
    a.score_frequency AS stored_frequency,
    a.score_sentiment_numeric AS stored_sentiment_numeric,
    a.score_context_numeric AS stored_context_numeric,
    COALESCE(c.sample_count, 0) AS recomputed_sample_count,
    COALESCE(c.mentioned_count, 0) AS recomputed_mentioned_count,
    ROUND(COALESCE(c.freq_value, 0), 2) AS recomputed_frequency,
    ROUND(COALESCE(c.recomputed_composite, 0), 2) AS recomputed_composite,
    COALESCE(c.recomputed_basis, 'frequency_only') AS recomputed_basis
  FROM audits a
  LEFT JOIN composite c ON c.audit_id = a.id
  WHERE a.status = 'complete'
)
SELECT
  audit_id,
  brand_id,
  completed_at,
  stored_composite,
  stored_frequency,
  recomputed_sample_count
FROM joined
WHERE recomputed_mentioned_count = 0
  AND COALESCE(stored_composite, 0) > 0.1
ORDER BY stored_composite DESC, audit_id;
