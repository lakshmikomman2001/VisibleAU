-- 0083-visibility-trends-mention-rate-run1-backup.sql (Vunnara, 20 Oct,
-- post-a093ceb, headline-fix follow-up, item 4)
--
-- PRODUCTION branch. Run on its own, as one editor submission. Run
-- AFTER the push (this fixes a jump that only appears POST-push --
-- running it before would re-introduce the jump the other way).
-- Sri-authorized only. NOT run from Claude Code.
--
-- WHY: every visibility_trends row was last written by
-- lib/visibility/visibility-trend-aggregator.ts as it stood AT THE TIME
-- -- rows written before Vunnara 19 Oct (post-aa83b3a, "the headline is
-- the mention rate") hold the OLD weighted 5-dimension blend in
-- score_composite_avg/score_frequency_avg, and EVERY row written before
-- today's push (post-a093ceb, item 3: a real 0% counts as latest) was
-- computed while a zero-mention audit's real data was silently excluded
-- from both the numerator and denominator of every average. Only the
-- CURRENT ISO week recomputes automatically (on the next audit.complete
-- event) -- every older row stays stale forever otherwise, so the first
-- comparison wins-feed/narrative-generator/generate-narrative-report
-- make after the push would silently diff one week computed the OLD way
-- against one computed the NEW way, reading as a fake jump that never
-- really happened.
--
-- This recomputes score_composite_avg, score_frequency_avg,
-- score_position_avg, score_accuracy_avg, audit_count, sample_quality
-- for EVERY existing row, mirroring aggregateVisibilityTrend's exact
-- rule (lib/visibility/visibility-trend-aggregator.ts, as of a093ceb):
-- run-1, organic (is_branded_prompt IS NOT TRUE) citations only; an
-- audit's headline/frequency is scored (and counted) only when its
-- organic sample has >= MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10)
-- successful answers, regardless of mention count; Position is scored
-- only when mentioned_count > 0 AND at least one mention has a real
-- rank (ranked_count > 0); Accuracy/Source-citation is scored only when
-- mentioned_count > 0. mention_rate/citation_rate/mention_source_ratio/
-- brand_archetype/market_competition_label/citation_volatility_score
-- are UNTOUCHED -- they were never gated by the removed
-- sufficientMentionsExists or by the headline's sample-size threshold
-- (mention_rate/citation_rate come from a separate, always-unfiltered
-- query; the rest derive only from those two), so they were never stale
-- in the way the six columns above were.
--
-- Snapshots the six affected columns' CURRENT values into
-- _backup_0083_visibility_trends (Neon's editor can't \copy) -- drop it
-- later with run4, once run3's post-check looks right and no rollback
-- is needed.
--
-- Also surfaces (read-only, no action) any row whose period_label, once
-- reconstructed to a date and reformatted back, does NOT round-trip --
-- the one known edge case in formatPeriodLabel (lib/visibility/
-- visibility-trend-aggregator.ts): it stamps the label with the plain
-- Gregorian year (date-fns `yyyy`), not the ISO week-numbering year
-- (`RRRR`), so a week that straddles the Dec/Jan ISO-year boundary (at
-- most a few days a year) could reconstruct to the wrong week here. If
-- mismatch_count below is 0 (expected for almost every org), run2 is
-- exact for every row; if not, STOP and tell Sri the mismatching
-- period_label values before running run2 -- don't guess at them.
--
-- Expected result: "Statement executed successfully" on the CREATE
-- TABLE tab, then one row with backup_row_count = (SELECT count(*) FROM
-- visibility_trends), and mismatch_count = 0.
CREATE TABLE _backup_0083_visibility_trends AS
SELECT
  id,
  score_composite_avg,
  score_frequency_avg,
  score_position_avg,
  score_accuracy_avg,
  audit_count,
  sample_quality
FROM visibility_trends;

SELECT count(*) AS backup_row_count FROM _backup_0083_visibility_trends;

SELECT count(*) AS mismatch_count
FROM visibility_trends vt
WHERE (
  -- Weekly: the label's year prefix (formatPeriodLabel's plain calendar
  -- `yyyy`) must equal the reconstructed date's own calendar year --
  -- i.e. parsing that prefix AS the ISO week-numbering year (IYYY, what
  -- run2 does) was unambiguous for this label -- AND the reconstructed
  -- date's ISO week number must equal the label's week suffix.
  vt.period_type = 'weekly'
  AND (
    EXTRACT(YEAR FROM to_date(vt.period_label, 'IYYY-"W"IW'))::text
      <> split_part(vt.period_label, '-W', 1)
    OR lpad(to_char(to_date(vt.period_label, 'IYYY-"W"IW'), 'IW'), 2, '0')
      <> split_part(vt.period_label, '-W', 2)
  )
)
OR (
  vt.period_type = 'monthly'
  AND to_char(to_date(vt.period_label || '-01', 'YYYY-MM-DD'), 'YYYY-MM') <> vt.period_label
);
