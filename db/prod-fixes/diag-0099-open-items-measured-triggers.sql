-- diag-0099-open-items-measured-triggers.sql
-- "Remove the last uses of the made-up 0-100 Position/Source scores"
-- (25 Oct), item 1
--
-- PRODUCTION branch. READ-ONLY: SELECT statements only. Paste into the
-- Neon SQL editor. NOT run from Claude Code -- there is no prod access
-- from that environment. Sri-authorized only. Nothing here changes any
-- row: the next audit regenerates each brand's items.
--
-- WHY: three recommendation rules used to read the 0-100 scores and now
-- read measured counts (lib/recommendations/triggers.ts):
--   expert-quotes      was score_accuracy < 60  -> under 60% of mentions linked a source
--   cited-statistics   was score_accuracy < 70  -> under 70% of mentions linked a source
--   comparison-article was score_position < 40 -> median rank worse than #5, or 5+
--                                                 mentions never in a ranked list
-- and none of them fires below 5 verified mentions. This shows, for every
-- open item, what the new rule would say for that item's own audit.
--
-- Mentions and sourced mentions are exact (the same organic, run-1,
-- verified basis as the audit page). The median rank is NOT stored
-- anywhere (the app recomputes it from the answer text), so
-- implied_median_rank inverts the stored score_position instead:
-- 1 + 50 * (1 - score/100). It is only as good as that stored score --
-- audits finished before 21 Oct used an older, wrong rank heuristic --
-- and a stored 0 means "no ranked mention" OR "median #51+". Treat the
-- comparison-article column as a guide, not a verdict.

-- 1. Every open item, with the measured basis for the three rewritten rules.
WITH open_items AS (
  SELECT ai.id, ai.organization_id, ai.brand_id, ai.audit_id, ai.recommendation_key,
         ai.title, ai.created_at
  FROM action_items ai
  WHERE ai.status = 'open'
),
measures AS (
  SELECT
    c.audit_id,
    count(*) FILTER (
      WHERE c.brand_mentioned = true AND c.mention_verification IS DISTINCT FROM 'unverified'
    ) AS mentions,
    count(*) FILTER (
      WHERE c.brand_mentioned = true
        AND c.mention_verification IS DISTINCT FROM 'unverified'
        AND jsonb_array_length(c.cited_sources) > 0
    ) AS sourced_mentions
  FROM citations c
  WHERE c.audit_id IN (SELECT audit_id FROM open_items)
    AND c.is_branded_prompt IS NOT TRUE
    AND c.run_number = 1
  GROUP BY c.audit_id
)
SELECT
  oi.recommendation_key,
  b.name AS brand_name,
  a.audit_number,
  oi.created_at::date AS item_created,
  COALESCE(m.mentions, 0) AS mentions,
  COALESCE(m.sourced_mentions, 0) AS sourced_mentions,
  a.score_accuracy AS old_score_accuracy,
  a.score_position AS old_score_position,
  CASE
    WHEN a.score_position IS NULL THEN NULL
    ELSE round(1 + 50 * (1 - a.score_position / 100.0), 1)
  END AS implied_median_rank,
  CASE oi.recommendation_key
    WHEN 'expert-quotes' THEN
      CASE WHEN COALESCE(m.mentions, 0) < 5 THEN 'would not fire (under 5 mentions)'
           WHEN m.sourced_mentions::numeric / m.mentions < 0.6 THEN 'still fires'
           ELSE 'would not fire (60%+ linked a source)' END
    WHEN 'cited-statistics' THEN
      CASE WHEN COALESCE(m.mentions, 0) < 5 THEN 'would not fire (under 5 mentions)'
           WHEN m.sourced_mentions::numeric / m.mentions < 0.7 THEN 'still fires'
           ELSE 'would not fire (70%+ linked a source)' END
    WHEN 'comparison-article' THEN
      CASE WHEN COALESCE(m.mentions, 0) < 5 THEN 'would not fire (under 5 mentions)'
           WHEN a.score_position IS NULL THEN 'unknown (no stored score)'
           WHEN a.score_position = 0 THEN 'likely still fires (no ranked mention)'
           WHEN 1 + 50 * (1 - a.score_position / 100.0) > 5 THEN 'likely still fires (median worse than #5)'
           ELSE 'likely would not fire (median #5 or better)' END
    ELSE 'unchanged (rule does not read Position or Source citation)'
  END AS under_new_rule
FROM open_items oi
JOIN audits a ON a.id = oi.audit_id
JOIN brands b ON b.id = oi.brand_id
LEFT JOIN measures m ON m.audit_id = oi.audit_id
ORDER BY (oi.recommendation_key IN ('expert-quotes', 'cited-statistics', 'comparison-article')) DESC,
         b.name, oi.recommendation_key;

-- 2. Totals: open items by key (the prompt counted 17).
SELECT recommendation_key, count(*) AS open_items
FROM action_items
WHERE status = 'open'
GROUP BY recommendation_key
ORDER BY recommendation_key;
