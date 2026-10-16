-- diag-0058-fulltext-mention-scan.sql (task #46 Phase 3, Part B)
--
-- PRODUCTION branch. READ-ONLY. Run the whole file as one statement,
-- pasted into the Neon SQL editor. NOT run from Claude Code -- there is
-- no prod access from that environment. Sri-authorized only. Run AFTER
-- prod-fix 0057 (citations.response_text) is applied AND the next fresh
-- audit of this brand has completed -- before that, every row's
-- response_text is NULL and this degrades to diag-0055's snippet-only
-- scan (see the fallback note below).
--
-- Pinned to Bondi Plumbing's brand id
-- 54b58fce-98f9-4749-ae25-9e541c0f874a (not a name lookup). Picks its
-- latest and previous COMPLETED audits by completed_at -- no audit id is
-- hardcoded. Same organic (is_branded_prompt IS NOT TRUE), run_number =
-- 1 basis as diag-0055.
--
-- WHAT THIS CHECKS: the follow-up to diag-0055, now that the FULL answer
-- text is stored. Per engine, per audit:
--   * full_text_rows / full_text_{min,avg,max}_chars -- how many rows
--     have response_text, and its length among those rows.
--   * stored_brand_mentioned_count -- what the app currently believes.
--   * raw_brand_scan_match_count -- regex scan for "bondi\s*plumbing"
--     (case-insensitive) OR the brand's domain stem (TLD and "www."
--     stripped, same shape as diag-0055 / detect-mention.ts's
--     entityDetect()), word-anchored.
--   * raw_bondi_word_match_count -- "Bondi" alone, word-anchored,
--     case-insensitive. Deliberately looser and noisier (the suburb,
--     the beach, other Bondi businesses all match) -- a hint of "the
--     engine talked about the area", NOT evidence of a brand mention.
--   * up to 3 excerpts (left(..., 200)) from rows where either raw scan
--     matched but brand_mentioned is false -- candidate missed mentions.
--
-- SCAN SOURCE / FALLBACK: scans COALESCE(response_text,
-- response_snippet) -- the full answer where stored, else the historical
-- 500-char snippet, so the query still returns something for pre-0057
-- rows. scanned_snippet_only_rows says how many rows fell back; for
-- those rows the diag-0055 caveat still applies (a mention past char 500
-- is invisible). Excerpts are the FIRST 200 chars of the scanned text,
-- not centred on the match.
--
-- WORD ANCHOR NOTE: uses Postgres's \y (word boundary). diag-0055 uses
-- '\b', which in Postgres regex is a BACKSPACE escape, not a word
-- boundary -- its domain-stem branch can therefore never match.

WITH target_brand AS (
  SELECT id, name, domain
  FROM brands
  WHERE id = '54b58fce-98f9-4749-ae25-9e541c0f874a'
),
brand_stem AS (
  SELECT
    regexp_replace(
      regexp_replace(lower(domain), '^www\.', ''),
      '\.(com\.au|com|net|org|io|co)$', ''
    ) AS stem_raw
  FROM target_brand
),
ranked_audits AS (
  SELECT
    a.id AS audit_id,
    a.audit_number,
    a.completed_at,
    ROW_NUMBER() OVER (ORDER BY a.completed_at DESC) AS rn
  FROM audits a
  JOIN target_brand b ON b.id = a.brand_id
  WHERE a.status = 'complete'
),
selected_audits AS (
  SELECT
    audit_id,
    audit_number,
    completed_at,
    CASE WHEN rn = 1 THEN 'latest' ELSE 'previous' END AS audit_label
  FROM ranked_audits
  WHERE rn IN (1, 2)
),
sourced AS (
  SELECT
    sa.audit_label,
    sa.audit_number,
    sa.completed_at,
    c.engine,
    c.brand_mentioned,
    c.response_text,
    COALESCE(c.response_text, c.response_snippet) AS scan_text
  FROM selected_audits sa
  JOIN citations c ON c.audit_id = sa.audit_id
  WHERE c.is_branded_prompt IS NOT TRUE
    AND c.run_number = 1
),
scanned AS (
  SELECT
    s.*,
    (
      s.scan_text ~* 'bondi\s*plumbing'
      OR (
        length(bs.stem_raw) >= 4
        AND s.scan_text ~* ('\y' || regexp_replace(bs.stem_raw, '[-.]', ' ', 'g') || '\y')
      )
    ) AS raw_brand_match,
    (s.scan_text ~* '\ybondi\y') AS raw_bondi_word_match
  FROM sourced s
  CROSS JOIN brand_stem bs
)
SELECT
  s.audit_label,
  s.audit_number,
  s.completed_at,
  s.engine,
  COUNT(*) AS organic_run1_responses,
  COUNT(s.response_text) AS full_text_rows,
  COUNT(*) - COUNT(s.response_text) AS scanned_snippet_only_rows,
  MIN(length(s.response_text)) AS full_text_min_chars,
  ROUND(AVG(length(s.response_text))) AS full_text_avg_chars,
  MAX(length(s.response_text)) AS full_text_max_chars,
  COUNT(*) FILTER (WHERE s.brand_mentioned) AS stored_brand_mentioned_count,
  COUNT(*) FILTER (WHERE s.raw_brand_match) AS raw_brand_scan_match_count,
  COUNT(*) FILTER (WHERE s.raw_bondi_word_match) AS raw_bondi_word_match_count,
  (
    SELECT array_agg(left(x.scan_text, 200))
    FROM (
      SELECT s2.scan_text
      FROM scanned s2
      WHERE s2.audit_label = s.audit_label
        AND s2.engine = s.engine
        AND (s2.raw_brand_match OR s2.raw_bondi_word_match)
        AND NOT s2.brand_mentioned
      LIMIT 3
    ) x
  ) AS candidate_missed_mention_excerpts
FROM scanned s
GROUP BY s.audit_label, s.audit_number, s.completed_at, s.engine
ORDER BY CASE s.audit_label WHEN 'latest' THEN 0 ELSE 1 END, s.engine;
